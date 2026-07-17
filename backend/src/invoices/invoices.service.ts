import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { parse } from "csv-parse/sync";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Invoice } from "./entities/invoice.entity";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { ImportRowError, ImportSummaryDto } from "./dto/import-result.dto";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { InvoiceEventsService } from "../realtime/invoice-events.service";
import { StructuredLogger } from "../observability/structured-logger.service";

const REQUIRED_CSV_HEADERS = [
  "invoiceNumber",
  "clientName",
  "clientEmail",
  "amount",
  "asset_code",
] as const;
const MAX_IMPORT_ROWS = 500;

/**
 * Invoices service — manages invoice lifecycle and Soroban on-chain settlement.
 */
@Injectable()
export class InvoicesService implements OnModuleInit {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly sorobanService: SorobanService,
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
    private readonly structuredLogger: StructuredLogger,
    @Optional()
    private readonly invoiceEvents?: InvoiceEventsService,
  ) {}

  /**
   * Publish an invoice status change to the realtime SSE stream.
   * No-op when the realtime module isn't wired in (e.g. unit tests).
   */
  private emitStatusChange(
    invoice: { id: string; status: string; merchantId?: string | null },
    merchantId?: string,
  ): void {
    const scope = merchantId ?? invoice.merchantId ?? undefined;
    if (!scope) return;
    this.invoiceEvents?.publishStatusChange({
      merchantId: scope,
      invoiceId: invoice.id,
      status: invoice.status,
      at: new Date().toISOString(),
    });
  }

  async onModuleInit() {
    // Skip seeding in test environment
    if (process.env.NODE_ENV === "test") {
      return;
    }

    // seed after PrismaService onModuleInit has run so client/fallback is available
    await this.seedSampleInvoices();
  }

  /**
   * Get paginated invoices
   * @param page - Page number (1-indexed)
   * @param limit - Items per page
   * @returns Paginated result
   */
  async findAll(
    merchantId: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
  ): Promise<{
    items: Invoice[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * limit;

    // Build where clause from filters
    const where: Record<string, unknown> = { merchantId };

    if (search && search.trim().length > 0) {
      const term = search.trim();
      where["OR"] = [
        { invoiceNumber: { contains: term, mode: "insensitive" } },
        { clientName: { contains: term, mode: "insensitive" } },
        { clientEmail: { contains: term, mode: "insensitive" } },
        { memo: { contains: term, mode: "insensitive" } },
      ];
    }

    if (status && status.trim().length > 0) {
      where["status"] = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const normalizedItems = items.map((inv) => this.normalizeInvoice(inv));
    return {
      items: normalizedItems,
      total,
      page,
      pageSize: limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Search invoices by merchant-scoped term using full-text and trigram similarity
   * @param userId - Authenticated merchant id
   * @param rawTerm - Query string from user input
   * @param limit - Max results (1-50)
   */
  async searchInvoices(
    userId: string | undefined,
    rawTerm: string,
    limit = 20,
  ): Promise<Invoice[]> {
    if (!userId) {
      throw new UnauthorizedException("Missing merchant context");
    }

    const term = rawTerm?.trim();
    if (!term) {
      return [];
    }

    const requestedLimit = Number.isFinite(limit) ? Math.floor(limit) : 20;
    const clampedLimit = Math.min(Math.max(requestedLimit, 1), 50);
    const tsQuery = this.buildTsQuery(term);
    const likePattern = `%${this.escapeLikePattern(term)}%`;
    const similarityFloor = 0.32;

    const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`
        WITH source AS (
          SELECT
            i.*,
            to_tsvector(
              'simple',
              coalesce(i."client_name", '') || ' ' ||
              coalesce(i."client_email", '') || ' ' ||
              coalesce(i."memo", '')
            ) AS document
          FROM "invoices" i
          WHERE i."user_id" = ${userId}
        )
        SELECT
          s."id",
          s."user_id" AS "userId",
          s."invoice_number" AS "invoiceNumber",
          s."client_name" AS "clientName",
          s."client_email" AS "clientEmail",
          s."description",
          s."amount",
          s."asset_code" AS "assetCode",
          s."asset_issuer" AS "assetIssuer",
          s."memo",
          s."memo_type" AS "memoType",
          s."status",
          s."destination_address" AS "destinationAddress",
          s."tx_hash" AS "txHash",
          s."soroban_tx_hash" AS "sorobanTxHash",
          s."soroban_contract_id" AS "sorobanContractId",
          s."metadata",
          s."due_date" AS "dueDate",
          s."created_at" AS "createdAt",
          s."updated_at" AS "updatedAt",
          ${
            tsQuery
              ? Prisma.sql`s.document @@ to_tsquery('simple', ${tsQuery}) AS ft_match,
                ts_rank_cd(s.document, to_tsquery('simple', ${tsQuery})) AS ft_rank,`
              : Prisma.sql`FALSE AS ft_match,
                0::float AS ft_rank,`
          }
          GREATEST(
            similarity(s."client_name", ${term}),
            similarity(s."client_email", ${term}),
            similarity(s."memo", ${term})
          ) AS trigram_rank
        FROM source s
        WHERE (
          ${
            tsQuery
              ? Prisma.sql`s.document @@ to_tsquery('simple', ${tsQuery}) OR`
              : Prisma.sql``
          }
          s."client_name" ILIKE ${likePattern}
          OR s."client_email" ILIKE ${likePattern}
          OR s."memo" ILIKE ${likePattern}
          OR similarity(s."client_name", ${term}) >= ${similarityFloor}
          OR similarity(s."client_email", ${term}) >= ${similarityFloor}
          OR similarity(s."memo", ${term}) >= ${similarityFloor}
        )
        ORDER BY
          ${
            tsQuery
              ? Prisma.sql`ft_match DESC,
                ft_rank DESC,`
              : Prisma.sql``
          }
          trigram_rank DESC,
          s."created_at" DESC
        LIMIT ${clampedLimit};
      `,
    );

    return rows.map((row) => {
      const {
        ft_match: _ftMatch,
        ft_rank: _ftRank,
        trigram_rank: _trigram,
        ...invoice
      } = row;
      return this.normalizeInvoice(invoice);
    });
  }

  /**
   * Find a single invoice by ID
   * @param id - Invoice UUID
   * @returns The invoice object
   * @throws NotFoundException if invoice not found
   */
  async findOne(id: string, merchantId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, merchantId },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!invoice)
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    return this.normalizeInvoice(invoice);
  }

  /**
   * Build the Prisma create-data payload for a new invoice.
   * Shared by single-invoice create() and bulk CSV import so both
   * stay in sync on memo generation, dueDate, and destination address.
   */
  private buildInvoiceCreateData(
    dto: CreateInvoiceDto,
    userId: string,
    merchantId: string,
  ) {
    const now = new Date();
    return {
      userId,
      merchantId,
      invoiceNumber: dto.invoiceNumber,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      description: dto.description || null,
      amount: dto.amount as any,
      amountPaid: 0 as any,
      amountDue: dto.amount as any,
      assetCode: dto.asset_code.toUpperCase(),
      assetIssuer: dto.asset_issuer ?? undefined,
      memo: this.generateMemoId(),
      memoType: "ID",
      status: "pending" as const,
      destinationAddress: this.stellarService.getMerchantPublicKey(),
      txHash: null,
      sorobanTxHash: null,
      sorobanContractId: null,
      metadata: Prisma.JsonNull,
      dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      statusHistory: {
        create: {
          status: "pending" as const,
        },
      },
    };
  }

  /**
   * Create a new invoice
   * @param dto - Create invoice DTO
   * @returns The created invoice including payment instructions
   */
  async create(
    dto: CreateInvoiceDto,
    userId: string,
    merchantId: string,
  ): Promise<Invoice> {
    const created = await this.prisma.invoice.create({
      data: this.buildInvoiceCreateData(dto, userId, merchantId),
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    this.structuredLogger.info("invoice.created", {
      domain: "invoices",
      event: "invoice_created",
      invoiceId: created.id,
      invoiceNumber: created.invoiceNumber,
      memo: created.memo,
      merchantId,
      userId,
      amount: created.amount,
      assetCode: created.assetCode,
      status: created.status,
    });

    return this.normalizeInvoice(created);
  }

  /**
   * Bulk-create invoices from an uploaded CSV file.
   * Invalid rows are reported without discarding valid rows.
   * @param buffer - Raw CSV file contents
   * @returns Import summary with created/failed/skipped counts and per-row detail
   */
  async importFromCsv(
    buffer: Buffer,
    userId: string,
    merchantId: string,
  ): Promise<ImportSummaryDto> {
    const rows = this.parseCsvBuffer(buffer);

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `CSV exceeds maximum of ${MAX_IMPORT_ROWS} rows`,
      );
    }

    const created: ImportSummaryDto["created"] = [];
    const failed: ImportRowError[] = [];
    const skipped: ImportRowError[] = [];
    const seenInvoiceNumbers = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +1 for 0-index, +1 for header row
      const { dto, errors } = await this.validateRow(rows[i], rowNum);

      if (errors.length > 0) {
        skipped.push(...errors);
        continue;
      }

      if (seenInvoiceNumbers.has(dto.invoiceNumber)) {
        skipped.push({
          row: rowNum,
          field: "invoiceNumber",
          message: "Duplicate invoiceNumber within this CSV",
        });
        continue;
      }
      seenInvoiceNumbers.add(dto.invoiceNumber);

      try {
        const invoice = await this.prisma.invoice.create({
          data: this.buildInvoiceCreateData(dto, userId, merchantId),
        });
        created.push({
          row: rowNum,
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      } catch (err) {
        this.logger.error(
          `CSV import: failed to create invoice at row ${rowNum}`,
          err as Error,
        );
        failed.push({
          row: rowNum,
          field: "invoiceNumber",
          message: this.describeImportDbError(err),
        });
      }
    }

    return {
      totalRows: rows.length,
      createdCount: created.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
      created,
      failed,
      skipped,
    };
  }

  /**
   * Parse a CSV buffer into header-mapped row objects, validating that all
   * required columns are present before any row is processed.
   */
  private parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("CSV file is empty");
    }

    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestException("Unable to parse CSV file");
    }

    if (records.length === 0) {
      return [];
    }

    const headers = Object.keys(records[0]);
    const missing = REQUIRED_CSV_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new BadRequestException(
        `CSV is missing required column(s): ${missing.join(", ")}`,
      );
    }

    return records;
  }

  /**
   * Validate a single CSV row against the same rules as CreateInvoiceDto.
   */
  private async validateRow(
    raw: Record<string, string>,
    rowNum: number,
  ): Promise<{ dto: CreateInvoiceDto; errors: ImportRowError[] }> {
    const amountValue = Number(String(raw.amount ?? "").trim());
    const errors: ImportRowError[] = [];

    if (raw.amount === undefined || raw.amount === "" || isNaN(amountValue)) {
      errors.push({
        row: rowNum,
        field: "amount",
        message: "amount must be a numeric value",
      });
    }

    const plain = {
      invoiceNumber: raw.invoiceNumber,
      clientName: raw.clientName,
      clientEmail: raw.clientEmail,
      description: raw.description || undefined,
      amount: isNaN(amountValue) ? undefined : amountValue,
      asset_code: raw.asset_code,
      asset_issuer: raw.asset_issuer || undefined,
    };

    const dto = plainToInstance(CreateInvoiceDto, plain);
    const validationErrors = await validate(dto);
    for (const error of validationErrors) {
      errors.push({
        row: rowNum,
        field: error.property,
        message: Object.values(error.constraints ?? {}).join("; "),
      });
    }

    return { dto, errors };
  }

  /** Translate a DB write failure during import into a user-facing message */
  private describeImportDbError(err: unknown): string {
    if (
      err &&
      typeof err === "object" &&
      (err as { code?: string }).code === "P2002"
    ) {
      return "invoiceNumber or memo already exists";
    }
    return "Failed to create invoice";
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status
   * @returns Updated invoice
   */
  async updateStatus(
    id: string,
    status: InvoiceStatus,
    merchantId?: string,
  ): Promise<Invoice> {
    const where = merchantId ? { id, merchantId } : { id };

    const updateResult = await this.prisma.invoice.updateMany({
      where,
      data: { status },
    });
    if (updateResult.count === 0) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    const updated = await this.prisma.invoice.findFirst({ where });
    if (!updated) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    // Create status history entry
    await this.prisma.invoiceStatusHistory.create({
      data: {
        invoiceId: updated.id,
        status,
      },
    });

    // Enqueue webhook
    await this.webhooksService.enqueueWebhook(
      id,
      status,
      updated.txHash,
      merchantId,
    );

    const updatedWithHistory = await this.prisma.invoice.findFirst({
      where,
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (status === "paid") {
      await this.notificationsService.notifyInvoicePaid(
        updatedWithHistory || updated,
      );
    } else if (status === "overdue") {
      await this.notificationsService.notifyInvoiceOverdue(
        updatedWithHistory || updated,
      );
    }

    this.emitStatusChange(updatedWithHistory || updated, merchantId);

    return this.normalizeInvoice(updatedWithHistory || updated);
  }

  /**
   * Mark invoice as paid and persist tx_hash
   * @param id - Invoice UUID
   * @param txHash - Stellar transaction hash
   * @returns Updated invoice
   */
  async markAsPaid(id: string, txHash: string): Promise<Invoice> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: "paid",
        txHash: txHash,
        statusHistory: {
          create: {
            status: "paid",
          },
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Enqueue webhook
    await this.webhooksService.enqueueWebhook(id, "paid", txHash);
    await this.notificationsService.notifyInvoicePaid(updated);

    this.emitStatusChange(updated);

    return this.normalizeInvoice(updated);
  }

  /**
   * Update Soroban metadata after anchoring
   * @param id - Invoice UUID
   * @param sorobanTxHash - Soroban transaction hash
   * @param contractId - Soroban contract ID
   * @returns Updated invoice
   */
  async updateSorobanMetadata(
    id: string,
    sorobanTxHash: string,
    contractId: string,
  ): Promise<Invoice> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        sorobanTxHash: sorobanTxHash,
        sorobanContractId: contractId,
        statusHistory: {
          create: {
            status: "anchored",
          },
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return this.normalizeInvoice(updated);
  }

  /**
   * Find invoice by memo (for payment matching)
   * @param memo - Stellar memo ID string
   * @returns Invoice or undefined if not found
   */
  async findByMemo(memo: string): Promise<Invoice | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { memo: memo },
    });
    if (!invoice) return null;
    // Cancelled invoices must never be matched by the reconciliation watcher
    if (invoice.status === "cancelled") return null;
    return this.normalizeInvoice(invoice);
  }

  async applySorobanPaymentEvent(evt: {
    eventId: string;
    contractId?: string;
    ledger?: number;
    invoice_id: string;
    payer?: string;
    asset_code?: string;
    asset_issuer?: string;
    amount?: string | number;
  }): Promise<Invoice | null> {
    const maybeId = this.stellarService.parseMemo(evt.invoice_id);
    const invoiceId = maybeId ?? evt.invoice_id;

    const existing = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!existing) {
      return null;
    }

    const txHash = `soroban:${evt.eventId}`;
    const contractId = evt.contractId ?? "unknown";

    // Replay guard: this exact (txHash, invoice, contract) combination was
    // already applied — most likely a redelivered/replayed RPC event.
    // Skip without touching amountPaid/Payment rows again.
    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: {
        txHash_invoiceId_contractId: { txHash, invoiceId, contractId },
      },
    });
    if (alreadyProcessed) {
      this.logger.warn(
        `Skipped replayed Soroban payment event: invoiceId=${invoiceId} eventId=${evt.eventId} txHash=${txHash} — already processed at ${alreadyProcessed.processedAt.toISOString()}`,
      );
      return this.normalizeInvoice(existing);
    }

    const sorobanMeta = {
      lastEventId: evt.eventId,
      contractId: evt.contractId ?? null,
      ledger: evt.ledger ?? null,
      invoice_id: evt.invoice_id,
      payer: evt.payer ?? null,
      asset_code: evt.asset_code ?? null,
      asset_issuer: evt.asset_issuer ?? null,
      amount: evt.amount ?? null,
      updatedAt: new Date().toISOString(),
    };

    if (existing.status !== "paid") {
      const paymentAmount = Number(evt.amount || 0);
      const currentPaid = Number(existing.amountPaid || 0);
      const newAmountPaid = currentPaid + paymentAmount;
      const currentAmount = Number(existing.amount);
      const newAmountDue = Math.max(0, currentAmount - newAmountPaid);
      const newStatus = newAmountDue <= 0 ? "paid" : "partially_paid";

      let updated;
      try {
        updated = await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: newStatus as any,
            txHash: newStatus === "paid" ? txHash : existing.txHash,
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            payments: {
              create: {
                amount: paymentAmount,
                txHash,
              },
            },
            metadata: {
              ...((existing.metadata as any) ?? {}),
              soroban: sorobanMeta,
            },
            statusHistory: {
              create: {
                status: newStatus as any,
              },
            },
          },
          include: {
            statusHistory: {
              orderBy: { createdAt: "asc" },
            },
          },
        });
      } catch (err) {
        // Defense-in-depth: a concurrent call recorded this txHash first.
        // The unique constraint on Payment.txHash caught a replay we
        // didn't already know about — treat it as a skipped replay.
        if ((err as { code?: string }).code === "P2002") {
          this.logger.warn(
            `Skipped replayed Soroban payment event: invoiceId=${invoiceId} eventId=${evt.eventId} txHash=${txHash} — duplicate Payment.txHash detected`,
          );
          return this.normalizeInvoice(existing);
        }
        throw err;
      }

      await this.recordReconciliationDecision({
        txHash,
        invoiceId,
        contractId,
        ledger: evt.ledger,
        status: "success",
      });

      if (newStatus === "paid") {
        await this.notificationsService.notifyInvoicePaid(updated);
      }
      this.emitStatusChange(updated);
      return this.normalizeInvoice(updated);
    } else {
      const updated = await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          metadata: {
            ...((existing.metadata as any) ?? {}),
            soroban: sorobanMeta,
          },
        },
        include: {
          statusHistory: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      await this.recordReconciliationDecision({
        txHash,
        invoiceId,
        contractId,
        ledger: evt.ledger,
        status: "success",
      });
      return this.normalizeInvoice(updated);
    }
  }

  /**
   * Persist a record of a reconciliation decision for observability/dedup,
   * mirroring the ledger kept by BackfillService.processEvent.
   */
  private async recordReconciliationDecision(params: {
    txHash: string;
    invoiceId: string;
    contractId: string;
    ledger?: number;
    status: "success" | "skipped" | "failed";
    errorMessage?: string;
  }): Promise<void> {
    await this.prisma.processedEvent.create({
      data: {
        txHash: params.txHash,
        ledger: BigInt(params.ledger ?? 0),
        invoiceId: params.invoiceId,
        contractId: params.contractId,
        status: params.status,
        errorMessage: params.errorMessage,
      },
    });
  }

  /**
   * Reconcile a Horizon-confirmed payment with the Soroban contract and the database.
   *
   * ## Idempotency
   * This method is safe to call multiple times for the same invoice. If a
   * previous run recorded the payment on-chain but failed before updating the
   * database, re-calling skips the Soroban write (avoiding `PaymentAlreadyRecorded`)
   * and proceeds directly to the database update.
   *
   * ## Flow
   * 1. Find invoice — throws NotFoundException if absent
   * 2. Check on-chain existence (hasInvoicePayment) — skip step 3 if already recorded
   * 3. Record payment on-chain (recordInvoicePayment)
   * 4. Mark invoice as paid in the database
   *
   * @param invoiceId   - Invoice UUID (used as on-chain key and DB lookup)
   * @param payer       - Stellar G... address of the payer
   * @param assetCode   - "XLM" or token code
   * @param assetIssuer - Issuer G... address; empty string for XLM
   * @param amount      - Amount as string (i128 smallest denomination)
   * @returns Updated invoice with status "paid" and on-chain tx hash
   */
  async reconcilePayment(
    invoiceId: string,
    payer: string,
    assetCode: string,
    assetIssuer: string,
    amount: string,
  ): Promise<Invoice & { txHash: string; ledger: number }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${invoiceId}" not found`);
    }

    // Cancelled invoices must never transition to paid through the watcher flow
    if (invoice.status === "cancelled") {
      throw new BadRequestException(
        `Invoice "${invoiceId}" is cancelled and cannot be paid`,
      );
    }

    // Replay guard: the invoice is already fully paid in the database.
    // Re-running reconciliation (e.g. a redelivered webhook/watcher tick)
    // must not double-count amountPaid or create a duplicate Payment row.
    if (invoice.status === "paid") {
      this.logger.warn(
        `Skipped replayed reconciliation: invoiceId=${invoiceId} is already paid — no changes applied`,
      );
      return {
        ...this.normalizeInvoice(invoice),
        txHash: invoice.txHash ?? "",
        ledger: 0,
      };
    }

    const paymentAmount = Number(amount || 0);
    const currentPaid = Number((invoice as any).amountPaid || 0);
    const newAmountPaid = currentPaid + paymentAmount;
    const currentAmount = Number(invoice.amount);
    const newAmountDue = Math.max(0, currentAmount - newAmountPaid);
    const newStatus = newAmountDue <= 0 ? "paid" : "partially_paid";

    let txHash = "pending_full_payment";
    let ledger = 0;

    // Step 2 — idempotency gate: check if already recorded on-chain.
    // We only record on-chain once the invoice is fully paid.
    if (newStatus === "paid") {
      const alreadyOnChain =
        await this.sorobanService.hasInvoicePayment(invoiceId);

      if (!alreadyOnChain) {
        // Step 3 — write to Soroban (admin-gated, requires ADMIN_SECRET_KEY).
        // For the contract, we can just pass the total amount that was paid.
        const result = await this.sorobanService.recordInvoicePayment({
          invoiceId,
          payer,
          assetCode,
          assetIssuer,
          amount: newAmountPaid.toString(),
        });
        txHash = result.hash;
        ledger = result.ledger;
        this.logger.log(
          `Invoice ${invoiceId} recorded on-chain — hash: ${txHash}, ledger: ${ledger}`,
        );
      } else {
        this.logger.log(
          `Invoice ${invoiceId} already on-chain — skipping Soroban write`,
        );
        // Retrieve confirmed details for the return value.
        const record = await this.sorobanService.getInvoicePayment(invoiceId);
        txHash = `on-chain@ledger`;
        ledger = Number(record.timestamp);
      }
    }

    // Step 4 — mark invoice as paid in the database.
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus as any,
        txHash: newStatus === "paid" ? txHash : invoice.txHash,
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        payments: {
          create: {
            amount: paymentAmount,
            // Only the final, fully-paid record carries a real on-chain
            // hash; partial payments have no confirmed hash yet, and
            // reusing the "pending_full_payment" placeholder across rows
            // would collide with the unique constraint on Payment.txHash.
            txHash: newStatus === "paid" ? txHash : null,
          },
        },
        statusHistory: {
          create: {
            status: newStatus as any,
          },
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (newStatus === "paid") {
      await this.webhooksService.enqueueWebhook(
        invoice.id,
        "paid",
        txHash,
        invoice.merchantId,
      );
      await this.notificationsService.notifyInvoicePaid(updated);
    } else {
      await this.webhooksService.enqueueWebhook(
        invoice.id,
        "partially_paid" as any,
        txHash,
        invoice.merchantId,
      );
    }

    this.emitStatusChange(updated);

    return { ...this.normalizeInvoice(updated), txHash, ledger };
  }

  /**
   * Cancel or void an unpaid invoice.
   *
   * Only invoices in `pending` or `overdue` status may be cancelled.
   * Paid invoices cannot be reversed through this endpoint.
   * Already-cancelled invoices are rejected to prevent duplicate webhooks.
   *
   * The cancellation reason and timestamp are stored in `metadata.cancellation`
   * so they survive for audit purposes.
   *
   * @param id         - Invoice UUID
   * @param merchantId - Merchant scope (enforces ownership)
   * @param reason     - Human-readable reason string (e.g. "cancelled", "voided")
   * @returns          - Plain object with id, status, reason, and cancelledAt
   */
  async cancelInvoice(
    id: string,
    merchantId: string,
    reason = "cancelled",
  ): Promise<{
    id: string;
    status: string;
    reason: string;
    cancelledAt: Date;
  }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, merchantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }
    if (invoice.status === "paid") {
      throw new BadRequestException("Cannot cancel a paid invoice");
    }
    if (invoice.status === "cancelled") {
      throw new BadRequestException("Invoice is already cancelled");
    }

    const cancelledAt = new Date();

    await this.prisma.invoice.update({
      where: { id },
      data: {
        status: "cancelled",
        metadata: {
          ...((invoice.metadata as any) ?? {}),
          cancellation: { reason, cancelledAt: cancelledAt.toISOString() },
        },
        statusHistory: {
          create: {
            status: "cancelled",
          },
        },
      },
    });

    await this.webhooksService.enqueueWebhook(
      id,
      "cancelled" as any,
      invoice.txHash,
      merchantId,
    );

    this.emitStatusChange({ id, status: "cancelled", merchantId }, merchantId);

    return { id, status: "cancelled", reason, cancelledAt };
  }

  /**
   * Cron job to expire overdue invoices.
   * Runs every day at 02:00 UTC.
   */
  @Cron("0 2 * * *")
  async handleOverdueInvoices() {
    this.logger.log("Running overdue invoices check...");
    try {
      const now = new Date();
      const overdueInvoices = await this.prisma.invoice.findMany({
        where: {
          status: "pending",
          dueDate: { lt: now },
        },
        select: { id: true },
      });

      if (overdueInvoices.length === 0) {
        this.logger.log("No overdue invoices found.");
        return;
      }

      this.logger.log(
        `Found ${overdueInvoices.length} overdue invoices. Expiring...`,
      );

      let successCount = 0;
      let failCount = 0;

      for (const invoice of overdueInvoices) {
        try {
          await this.updateStatus(invoice.id, "overdue");
          successCount++;
        } catch (err) {
          this.logger.error(`Failed to expire invoice ${invoice.id}`, err);
          failCount++;
        }
      }

      this.logger.log(`Expired ${successCount} invoices. Failed: ${failCount}`);
    } catch (error) {
      this.logger.error("Error in handleOverdueInvoices cron job", error);
    }
  }

  /** Normalize invoice before returning to callers (convert Decimal/string amounts to number and add destination address) */
  private normalizeInvoice(inv: any): Invoice {
    const amount = inv?.amount;
    let numericAmount: number | string = amount;
    try {
      if (
        amount &&
        typeof amount === "object" &&
        typeof amount.toNumber === "function"
      ) {
        numericAmount = amount.toNumber();
      } else {
        numericAmount = Number(amount);
      }
    } catch {
      numericAmount = Number(String(amount));
    }

    return {
      ...inv,
      amount: numericAmount,
      asset_code: inv.assetCode,
      asset: inv.assetCode,
      asset_issuer: inv.assetIssuer === null ? undefined : inv.assetIssuer,
      memo_type: inv.memoType,
      tx_hash: inv.txHash,
      destination_address:
        inv.destinationAddress || this.stellarService.getMerchantPublicKey(),
    };
  }

  /**
   * Generate a unique Stellar MEMO_ID (uint64) for unambiguous payment matching.
   * Combines current timestamp (ms) shifted by 16 bits with a random 16-bit suffix
   * to minimise collision probability across concurrent requests.
   * @returns String representation of the uint64 integer
   */
  private generateMemoId(): string {
    const timestamp = Date.now(); // ~41 bits
    const random = Math.floor(Math.random() * 65536); // 16 bits
    // Result fits comfortably within Number.MAX_SAFE_INTEGER (~53 bits)
    return String(timestamp * 65536 + random);
  }

  /** Build a safe tsquery string that supports prefix matching by appending :* per token */
  private buildTsQuery(term: string): string | null {
    const tokens = term
      .split(/\s+/)
      .map((token) => token.replace(/[':*&|!]/g, "").trim())
      .filter((token) => token.length > 0)
      .slice(0, 5);
    if (tokens.length === 0) {
      return null;
    }
    return tokens.map((token) => `${token}:*`).join(" & ");
  }

  /** Escape LIKE wildcards to avoid unintended pattern expansion */
  private escapeLikePattern(term: string): string {
    return term.replace(/[%_\\]/g, (char) => `\\${char}`);
  }

  /**
   * Duplicate an existing invoice to create a new invoice with the same details
   * but with a new invoice number, memo, and pending status
   * @param id - Invoice UUID to duplicate
   * @param merchantId - Merchant scope (enforces ownership)
   * @param userId - User creating the duplicate
   * @returns The duplicated invoice
   */
  async duplicateInvoice(
    id: string,
    merchantId: string,
    userId: string,
  ): Promise<Invoice> {
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { id, merchantId },
    });

    if (!existingInvoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }

    // Generate a new invoice number based on the original
    const baseNumber = existingInvoice.invoiceNumber || "INV";
    const newInvoiceNumber = `${baseNumber}-COPY-${Date.now().toString().slice(-4)}`;

    // Create the duplicate invoice
    const duplicated = await this.prisma.invoice.create({
      data: {
        userId,
        merchantId,
        invoiceNumber: newInvoiceNumber,
        clientName: existingInvoice.clientName,
        clientEmail: existingInvoice.clientEmail,
        description: existingInvoice.description,
        amount: existingInvoice.amount,
        amountPaid: 0 as any,
        amountDue: existingInvoice.amount,
        assetCode: existingInvoice.assetCode,
        assetIssuer: existingInvoice.assetIssuer,
        memo: this.generateMemoId(),
        memoType: "ID",
        status: "pending" as const,
        destinationAddress: this.stellarService.getMerchantPublicKey(),
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: Prisma.JsonNull,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        statusHistory: {
          create: {
            status: "pending" as const,
          },
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    this.structuredLogger.info("invoice.duplicated", {
      domain: "invoices",
      event: "invoice_duplicated",
      originalInvoiceId: id,
      newInvoiceId: duplicated.id,
      invoiceNumber: duplicated.invoiceNumber,
      memo: duplicated.memo,
      merchantId,
      userId,
      amount: duplicated.amount,
      assetCode: duplicated.assetCode,
    });

    return this.normalizeInvoice(duplicated);
  }

  /**
   * Seed sample invoices for demonstration purposes
   */
  private async seedSampleInvoices(): Promise<void> {
    const merchantPublicKey =
      this.stellarService.getMerchantPublicKey() ||
      "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const defaultMerchantId = "00000000-0000-0000-0000-000000000000";

    const count = await this.prisma.invoice.count();
    if (count > 0) return;

    await this.prisma.invoice.createMany({
      data: [
        {
          merchantId: defaultMerchantId,
          invoiceNumber: "INV-001",
          clientName: "Acme Corporation",
          clientEmail: "billing@acme.com",
          description: "Web development services - March 2026",
          amount: 1500.0 as any,
          amountPaid: 0 as any,
          amountDue: 1500.0 as any,
          assetCode: "USDC",
          assetIssuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          memo: this.generateMemoId(),
          memoType: "ID",
          status: "pending",
          destinationAddress: merchantPublicKey,
          txHash: null,
          sorobanTxHash: null,
          sorobanContractId: null,
          metadata: Prisma.JsonNull,
          dueDate: new Date("2026-03-31T23:59:59Z"),
        },
        {
          merchantId: defaultMerchantId,
          invoiceNumber: "INV-002",
          clientName: "TechStart Inc",
          clientEmail: "payments@techstart.io",
          description: "Consulting services - Q1 2026",
          amount: 5000.0 as any,
          amountPaid: 5000.0 as any,
          amountDue: 0 as any,
          assetCode: "XLM",
          assetIssuer: null,
          memo: this.generateMemoId(),
          memoType: "ID",
          status: "paid",
          destinationAddress: merchantPublicKey,
          txHash: null,
          sorobanTxHash: null,
          sorobanContractId: null,
          metadata: Prisma.JsonNull,
          dueDate: new Date("2026-03-15T23:59:59Z"),
        },
        {
          merchantId: defaultMerchantId,
          invoiceNumber: "INV-003",
          clientName: "Global Solutions Ltd",
          clientEmail: "accounts@globalsolutions.com",
          description: "API integration project",
          amount: 3200.5 as any,
          amountPaid: 0 as any,
          amountDue: 3200.5 as any,
          assetCode: "USDC",
          assetIssuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          memo: this.generateMemoId(),
          memoType: "ID",
          status: "overdue",
          destinationAddress: merchantPublicKey,
          txHash: null,
          sorobanTxHash: null,
          sorobanContractId: null,
          metadata: Prisma.JsonNull,
          dueDate: new Date("2026-02-10T23:59:59Z"),
        },
      ],
    });
  }
}
