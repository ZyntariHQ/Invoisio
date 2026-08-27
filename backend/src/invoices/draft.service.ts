import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { ActivityFeedService } from "../activity-feed/activity-feed.service";
import { StellarService } from "../stellar/stellar.service";
import { Prisma, InvoiceStatus } from "@prisma/client";
import {
  DraftInvoiceDto,
  DraftResponseDto,
  CreateDraftDto,
  UpdateDraftDto,
} from "./dto/draft-invoice.dto";
import { Invoice } from "./entities/invoice.entity";

/**
 * Draft service handles the complete lifecycle of invoice drafts
 * including autosave, retrieval, and cleanup
 */
@Injectable()
export class DraftService {
  private readonly AUTO_SAVE_INTERVAL_MS = 30_000; // 30 seconds
  private readonly DRAFT_EXPIRY_DAYS = 30; // 30 days before cleanup

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly structuredLogger: StructuredLogger,
    private readonly activityFeed: ActivityFeedService,
  ) {}

  /**
   * Create a new draft invoice
   */
  async createDraft(
    dto: CreateDraftDto,
    userId: string,
    merchantId: string,
  ): Promise<DraftResponseDto> {
    const now = new Date();

    // Generate a unique memo for the draft
    const memo = this.generateMemoId();

    // Build the draft data
    const draftData = this.buildDraftData(dto);

    const created = await this.prisma.invoice.create({
      data: {
        userId,
        merchantId,
        invoiceNumber:
          dto.invoiceNumber || `DRAFT-${Date.now().toString().slice(-6)}`,
        clientName: dto.clientName || "Untitled Client",
        clientEmail: dto.clientEmail || "",
        description: dto.description || null,
        amount: dto.amount || 0,
        amountPaid: 0,
        amountDue: dto.amount || 0,
        assetCode: dto.asset_code?.toUpperCase() || "XLM",
        assetIssuer: dto.asset_issuer || null,
        memo: memo,
        memoType: "ID",
        status: "draft",
        destinationAddress: this.stellarService.getMerchantPublicKey(),
        txHash: null,
        sorobanTxHash: null,
        sorobanContractId: null,
        metadata: dto.metadata
          ? (dto.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        dueDate: dto.due_date ? new Date(dto.due_date) : null,
        isDraft: true,
        draftVersion: 1,
        lastAutoSavedAt: now,
        draftData: draftData as Prisma.InputJsonValue,
        customerId: dto.customer_id || null,
        statusHistory: {
          create: {
            status: "draft",
          },
        },
      },
    });

    this.structuredLogger.info("draft.created", {
      domain: "invoices",
      event: "draft_created",
      draftId: created.id,
      invoiceNumber: created.invoiceNumber,
      merchantId,
      userId,
    });

    this.activityFeed?.recordEvent({
      merchantId,
      userId,
      invoiceId: created.id,
      type: "draft_created",
      description: `Created invoice draft #${created.invoiceNumber}`,
      metadata: {
        invoiceNumber: created.invoiceNumber,
        draftVersion: 1,
      },
    });

    return this.toDraftResponse(created);
  }

  /**
   * Update an existing draft (autosave)
   */
  async updateDraft(
    id: string,
    dto: UpdateDraftDto,
    userId: string,
    merchantId: string,
  ): Promise<DraftResponseDto> {
    // Verify ownership and draft status
    const existing = await this.prisma.invoice.findFirst({
      where: { id, merchantId, isDraft: true },
    });

    if (!existing) {
      throw new NotFoundException(`Draft invoice with ID "${id}" not found`);
    }

    // Merge existing draft data with new data
    const currentDraftData =
      (existing.draftData as Record<string, unknown>) || {};
    const newDraftData = {
      ...currentDraftData,
      ...this.buildDraftData(dto),
    };

    // NOTE: typed as the *unchecked* update input (not Prisma.InvoiceUpdateInput)
    // so that scalar FK fields like `customerId` are assignable directly,
    // matching the pattern createDraft already relies on via inference.
    const updateData: Prisma.InvoiceUncheckedUpdateInput = {
      draftData: newDraftData as Prisma.InputJsonValue,
      lastAutoSavedAt: new Date(),
      draftVersion: existing.draftVersion + 1,
      updatedAt: new Date(),
    };

    // Update fields if provided
    if (dto.invoiceNumber !== undefined) {
      updateData.invoiceNumber = dto.invoiceNumber;
    }
    if (dto.clientName !== undefined) {
      updateData.clientName = dto.clientName || "Untitled Client";
    }
    if (dto.clientEmail !== undefined) {
      updateData.clientEmail = dto.clientEmail || "";
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description || null;
    }
    if (dto.amount !== undefined) {
      updateData.amount = dto.amount;
      updateData.amountDue = dto.amount;
    }
    if (dto.asset_code !== undefined) {
      updateData.assetCode = dto.asset_code.toUpperCase();
    }
    if (dto.asset_issuer !== undefined) {
      updateData.assetIssuer = dto.asset_issuer || null;
    }
    if (dto.customer_id !== undefined) {
      updateData.customerId = dto.customer_id || null;
    }
    if (dto.due_date !== undefined) {
      updateData.dueDate = dto.due_date ? new Date(dto.due_date) : null;
    }
    if (dto.metadata !== undefined) {
      updateData.metadata = dto.metadata
        ? (dto.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    this.structuredLogger.debug("draft.updated", {
      domain: "invoices",
      event: "draft_updated",
      draftId: updated.id,
      version: updated.draftVersion,
      merchantId,
      userId,
    });

    return this.toDraftResponse(updated);
  }

  /**
   * Get a draft by ID
   */
  async getDraft(id: string, merchantId: string): Promise<DraftResponseDto> {
    const draft = await this.prisma.invoice.findFirst({
      where: { id, merchantId, isDraft: true },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft invoice with ID "${id}" not found`);
    }

    return this.toDraftResponse(draft);
  }

  /**
   * Get all drafts for a merchant
   */
  async getDrafts(
    merchantId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: DraftResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { merchantId, isDraft: true },
        skip,
        take: limit,
        orderBy: { lastAutoSavedAt: "desc" },
        include: {
          statusHistory: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      this.prisma.invoice.count({
        where: { merchantId, isDraft: true },
      }),
    ]);

    return {
      items: items.map((inv) => this.toDraftResponse(inv)),
      total,
      page,
      pageSize: limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Convert a draft to a real invoice (send/issue)
   */
  async convertDraftToInvoice(
    id: string,
    merchantId: string,
    userId: string,
  ): Promise<Invoice> {
    // Verify ownership and draft status
    const draft = await this.prisma.invoice.findFirst({
      where: { id, merchantId, isDraft: true },
    });

    if (!draft) {
      throw new NotFoundException(`Draft invoice with ID "${id}" not found`);
    }

    // Validate required fields
    const errors = this.validateDraftForConversion(draft);
    if (errors.length > 0) {
      throw new BadRequestException(
        `Cannot convert draft to invoice: ${errors.join(", ")}`,
      );
    }

    // Generate a proper invoice number if it's still a draft number
    let invoiceNumber = draft.invoiceNumber;
    if (invoiceNumber.startsWith("DRAFT-")) {
      invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    }

    // Convert to real invoice
    const converted = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: "pending",
        isDraft: false,
        invoiceNumber: invoiceNumber,
        // Validation guarantees these are real values, not placeholders
        clientName: draft.clientName,
        clientEmail: draft.clientEmail,
        amountDue: draft.amount,
        // If draft had due date, keep it, otherwise set default 30 days
        dueDate:
          draft.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        memo: this.generateMemoId(), // Generate new memo for payment tracking
        statusHistory: {
          create: {
            status: "pending",
          },
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    this.structuredLogger.info("draft.converted", {
      domain: "invoices",
      event: "draft_converted_to_invoice",
      draftId: id,
      invoiceId: converted.id,
      invoiceNumber: converted.invoiceNumber,
      merchantId,
      userId,
    });

    this.activityFeed?.recordEvent({
      merchantId,
      userId,
      invoiceId: converted.id,
      type: "draft_converted",
      description: `Converted draft #${draft.invoiceNumber} to invoice #${converted.invoiceNumber}`,
      metadata: {
        originalDraftId: id,
        draftNumber: draft.invoiceNumber,
        invoiceNumber: converted.invoiceNumber,
      },
    });

    // Return as full Invoice entity
    //
    // ASSUMPTION (unverified — I don't have entities/invoice.entity.ts):
    // the compiler error said `Invoice` has `user`, not `userId`. I couldn't
    // confirm whether that's a typo in the entity or intentional. Kept
    // `userId` here but cast through `as unknown as Invoice` so this compiles
    // without guessing at the entity's real shape. Once you share
    // invoice.entity.ts, replace this cast with a correct object literal
    // (either add `userId?: string` to the entity, or map to `user` here).
    return {
      id: converted.id,
      merchantId: converted.merchantId,
      userId: converted.userId || undefined,
      invoiceNumber: converted.invoiceNumber,
      clientName: converted.clientName,
      clientEmail: converted.clientEmail,
      description: converted.description,
      amount: converted.amount.toNumber(),
      amountPaid: converted.amountPaid.toNumber(),
      amountDue: converted.amountDue.toNumber(),
      asset_code: converted.assetCode,
      asset_issuer: converted.assetIssuer,
      memo: converted.memo,
      memo_type: converted.memoType,
      tx_hash: converted.txHash,
      status: converted.status,
      metadata: converted.metadata,
      dueDate: converted.dueDate,
      createdAt: converted.createdAt,
      updatedAt: converted.updatedAt,
      destination_address: converted.destinationAddress,
      customerId: converted.customerId,
      statusHistory: converted.statusHistory.map((h) => ({
        id: h.id,
        invoiceId: h.invoiceId,
        status: h.status,
        createdAt: h.createdAt,
      })),
      payments: [],
    } as unknown as Invoice;
  }

  /**
   * Discard/delete a draft
   */
  async discardDraft(
    id: string,
    merchantId: string,
  ): Promise<{ id: string; discarded: boolean }> {
    // Verify ownership and draft status
    const draft = await this.prisma.invoice.findFirst({
      where: { id, merchantId, isDraft: true },
    });

    if (!draft) {
      throw new NotFoundException(`Draft invoice with ID "${id}" not found`);
    }

    // Hard delete the draft
    await this.prisma.invoice.delete({
      where: { id },
    });

    this.structuredLogger.info("draft.discarded", {
      domain: "invoices",
      event: "draft_discarded",
      draftId: id,
      invoiceNumber: draft.invoiceNumber,
      merchantId,
    });

    return { id, discarded: true };
  }

  /**
   * Clean up old drafts that haven't been touched
   */
  async cleanupOldDrafts(): Promise<{ deletedCount: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.DRAFT_EXPIRY_DAYS);

    const result = await this.prisma.invoice.deleteMany({
      where: {
        isDraft: true,
        lastAutoSavedAt: {
          lt: cutoff,
        },
        status: "draft",
      },
    });

    if (result.count > 0) {
      this.structuredLogger.info("draft.cleanup", {
        domain: "invoices",
        event: "drafts_cleaned_up",
        deletedCount: result.count,
        cutoffDate: cutoff.toISOString(),
      });
    }

    return { deletedCount: result.count };
  }

  /**
   * Auto-save a draft (utility method for frontend polling)
   */
  async autoSaveDraft(
    id: string,
    updates: Partial<UpdateDraftDto>,
    userId: string,
    merchantId: string,
  ): Promise<DraftResponseDto> {
    // Add autoSave flag
    const dto: UpdateDraftDto = {
      ...updates,
      autoSave: true,
    };

    return this.updateDraft(id, dto, userId, merchantId);
  }

  /**
   * Build draft data object from DTO
   */
  private buildDraftData(
    dto: Partial<DraftInvoiceDto>,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.clientEmail !== undefined) data.clientEmail = dto.clientEmail;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.asset_code !== undefined) data.asset_code = dto.asset_code;
    if (dto.asset_issuer !== undefined) data.asset_issuer = dto.asset_issuer;
    if (dto.customer_id !== undefined) data.customer_id = dto.customer_id;
    if (dto.due_date !== undefined) data.due_date = dto.due_date;
    if (dto.metadata !== undefined) data.metadata = dto.metadata;

    data.lastUpdated = new Date().toISOString();

    return data;
  }

  /**
   * Validate if a draft has all required fields to become an invoice.
   * Rejects empty, missing, and placeholder client identity values so
   * that production invoices always carry real client data.
   */
  private validateDraftForConversion(draft: any): string[] {
    const errors: string[] = [];

    // --- clientName ---
    const name = (draft.clientName ?? "").trim();
    if (!name) {
      errors.push("Client name is required");
    } else if (this.isPlaceholderName(name)) {
      errors.push(
        `Client name "${name}" appears to be a placeholder. Please enter the real client or company name`,
      );
    }

    // --- clientEmail ---
    const email = (draft.clientEmail ?? "").trim();
    if (!email) {
      errors.push("Client email is required");
    } else if (this.isPlaceholderEmail(email)) {
      errors.push(
        `Client email "${email}" appears to be a placeholder. Please enter a real email address`,
      );
    }

    // --- amount ---
    if (!draft.amount || draft.amount <= 0) {
      errors.push("Amount must be greater than 0");
    }

    // --- asset code ---
    if (!draft.assetCode) {
      errors.push("Asset code is required");
    }
    if (draft.assetCode !== "XLM" && !draft.assetIssuer) {
      errors.push("Asset issuer is required for non-XLM assets");
    }

    return errors;
  }

  /**
   * Patterns that indicate a client name is still a placeholder.
   * Matched case-insensitively against the trimmed value.
   */
  private static readonly PLACEHOLDER_NAME_PATTERNS: RegExp[] = [
    /^client$/i,
    /^customer$/i,
    /^untitled\s*client$/i,
    /^vendor\s*(or|&)\s*client$/i,
    /^vendor$/i,
    /^counterparty$/i,
    /^test(\s*client)?$/i,
    /^placeholder$/i,
    /^n\/?a$/i,
    /^none$/i,
    /^xxx+$/i,
    /^todo$/i,
    /^tbd$/i,
    /^lambda\s*cargo$/i,
    /^your\s*client$/i,
    /^company\s*name$/i,
    /^client\s*name$/i,
    /^enter\s*name$/i,
    /^name$/i,
  ];

  /**
   * Email patterns that are clearly not real client addresses.
   */
  private static readonly PLACEHOLDER_EMAIL_PATTERNS: RegExp[] = [
    /^test@/i,
    /@example\.com$/i,
    /@placeholder/i,
    /@test\.com$/i,
    /@todo\.com$/i,
    /@yourcompany\.com$/i,
    /@noreply/i,
    /@noemail/i,
    /@none\.com$/i,
    /^n\/?a$/i,
    /^none$/i,
    /^placeholder$/i,
    /^email$/i,
    /^enter\s*email$/i,
    /^client\s*email$/i,
    /^client@example\.com$/i,
  ];

  /**
   * Check whether a client name looks like a placeholder value.
   */
  private isPlaceholderName(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return true;
    for (const pattern of DraftService.PLACEHOLDER_NAME_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }
    if (trimmed.length <= 1) return true;
    return false;
  }

  /**
   * Check whether an email looks like a placeholder value.
   */
  private isPlaceholderEmail(email: string): boolean {
    const trimmed = email.trim();
    if (!trimmed) return true;
    if (!trimmed.includes("@")) return true;
    for (const pattern of DraftService.PLACEHOLDER_EMAIL_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }
    return false;
  }

  /**
   * Generate a unique Stellar MEMO_ID for payment matching
   */
  private generateMemoId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 65536);
    return String(timestamp * 65536 + random);
  }

  /**
   * Convert Prisma invoice to DraftResponseDto
   */
  private toDraftResponse(invoice: any): DraftResponseDto {
    const draftData = (invoice.draftData as Record<string, unknown>) || {};
    const requiredFields = [
      "clientName",
      "clientEmail",
      "amount",
      "asset_code",
    ];
    const hasRequiredFields = requiredFields.every((field) => {
      // Check in the main invoice fields and in draftData
      const mainValue = invoice[field] ?? invoice[this.snakeToCamel(field)];
      const draftValue = draftData[field];
      const value = mainValue || draftValue;
      return value !== undefined && value !== null && value !== "";
    });

    // Calculate completion percentage
    const allFields = [
      "invoiceNumber",
      "clientName",
      "clientEmail",
      "description",
      "amount",
      "asset_code",
    ];
    const filledFields = allFields.filter((field) => {
      const mainValue = invoice[field] ?? invoice[this.snakeToCamel(field)];
      const draftValue = draftData[field];
      const value = mainValue || draftValue;
      return value !== undefined && value !== null && value !== "";
    });
    const completionPercentage = Math.round(
      (filledFields.length / allFields.length) * 100,
    );

    return {
      id: invoice.id,
      merchantId: invoice.merchantId,
      userId: invoice.userId || undefined,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      description: invoice.description,
      amount: invoice.amount?.toNumber
        ? invoice.amount.toNumber()
        : Number(invoice.amount),
      assetCode: invoice.assetCode,
      assetIssuer: invoice.assetIssuer,
      customerId: invoice.customerId,
      dueDate: invoice.dueDate,
      isDraft: invoice.isDraft,
      draftVersion: invoice.draftVersion,
      lastAutoSavedAt: invoice.lastAutoSavedAt,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      metadata: (invoice.metadata as Record<string, unknown>) || undefined,
      hasRequiredFields,
      completionPercentage,
    };
  }

  /**
   * Helper to convert snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
