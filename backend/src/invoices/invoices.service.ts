import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { Invoice } from "./entities/invoice.entity";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { WebhooksService } from "../webhooks/webhooks.service";

/**
 * Invoices service — manages invoice lifecycle and Soroban on-chain settlement.
 */
@Injectable()
export class InvoicesService implements OnModuleInit {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly sorobanService: SorobanService,
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
  ) {}

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
    page = 1,
    limit = 20,
  ): Promise<{
    items: Invoice[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.invoice.count(),
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
  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice)
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    return this.normalizeInvoice(invoice);
  }

  /**
   * Create a new invoice
   * @param dto - Create invoice DTO
   * @returns The created invoice including payment instructions
   */
  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const memo = this.generateMemoId();
    const now = new Date();
    const created = await this.prisma.invoice.create({
      data: {
        invoiceNumber: dto.invoiceNumber,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        description: dto.description || null,
        amount: dto.amount as any,
        assetCode: dto.asset_code.toUpperCase(),
        assetIssuer: dto.asset_issuer ?? undefined,
        memo: memo,
        memoType: "ID",
        status: "pending",
        destinationAddress: this.stellarService.getMerchantPublicKey(),
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: Prisma.JsonNull,
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return this.normalizeInvoice(created);
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status
   * @returns Updated invoice
   */
  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status },
    });

    // Enqueue webhook
    await this.webhooksService.enqueueWebhook(id, status, updated.txHash);

    return this.normalizeInvoice(updated);
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
      data: { status: "paid", txHash: txHash },
    });

    // Enqueue webhook
    await this.webhooksService.enqueueWebhook(id, "paid", txHash);

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
    const invoice = await this.prisma.invoice.findUnique({
      where: { memo: memo },
    });
    if (!invoice) return null;
    return this.normalizeInvoice(invoice);
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
    const invoice = await this.findOne(invoiceId);

    // Step 2 — idempotency gate: check if already recorded on-chain.
    const alreadyOnChain =
      await this.sorobanService.hasInvoicePayment(invoiceId);

    let txHash = "";
    let ledger = 0;

    if (!alreadyOnChain) {
      // Step 3 — write to Soroban (admin-gated, requires ADMIN_SECRET_KEY).
      const result = await this.sorobanService.recordInvoicePayment({
        invoiceId,
        payer,
        assetCode,
        assetIssuer,
        amount,
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

    // Step 4 — mark invoice as paid in the database.
    const updated = await this.updateStatus(invoice.id, "paid");
    return { ...updated, txHash, ledger };
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
      asset_issuer: inv.assetIssuer === null ? undefined : inv.assetIssuer,
      memo_type: inv.memoType,
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
   * Seed sample invoices for demonstration purposes
   */
  private async seedSampleInvoices(): Promise<void> {
    const merchantPublicKey =
      this.stellarService.getMerchantPublicKey() ||
      "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

    const count = await this.prisma.invoice.count();
    if (count > 0) return;

    await this.prisma.invoice.createMany({
      data: [
        {
          invoiceNumber: "INV-001",
          clientName: "Acme Corporation",
          clientEmail: "billing@acme.com",
          description: "Web development services - March 2026",
          amount: 1500.0 as any,
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
          invoiceNumber: "INV-002",
          clientName: "TechStart Inc",
          clientEmail: "payments@techstart.io",
          description: "Consulting services - Q1 2026",
          amount: 5000.0 as any,
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
          invoiceNumber: "INV-003",
          clientName: "Global Solutions Ltd",
          clientEmail: "accounts@globalsolutions.com",
          description: "API integration project",
          amount: 3200.5 as any,
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
