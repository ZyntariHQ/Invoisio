import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Delete,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Throttle } from "@nestjs/throttler";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { SearchInvoicesDto } from "./dto/search-invoices.dto";
import { ImportSummaryDto } from "./dto/import-result.dto";
import { Invoice } from "./entities/invoice.entity";
import { InvoiceStatus } from "@prisma/client";
import { Auth, CurrentUser, Public } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";
import {
  PaymentReviewsService,
  ResolveReviewDto,
} from "./payment-reviews.service";
import { DraftService } from "./draft.service";
import {
  CreateDraftDto,
  UpdateDraftDto,
  DraftResponseDto,
} from "./dto/draft-invoice.dto";

/**
 * Invoices controller
 * Manages invoice creation, retrieval, and status updates
 *
 * Future enhancements:
 * - Add pagination for list endpoint
 * - Add filtering by status, date range
 * - Integrate with StellarModule for payment verification
 */
@Controller("invoices")
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly prisma: PrismaService,
    private readonly paymentReviewsService: PaymentReviewsService,
    private readonly draftService: DraftService,
  ) {}

  /**
   * Get all invoices
   * @returns Array of all invoices
   */
  @Auth()
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ): Promise<Invoice[]> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const result = await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.findAll(user.merchantId, p, l, search, status),
    );
    return result.items;
  }

  /**
   * Search invoices by client name, email, or memo for the authenticated merchant
   * @returns Array of matching invoices ordered by relevance
   */
  @Auth()
  @Get("search")
  async search(
    @CurrentUser() user: User,
    @Query() query: SearchInvoicesDto,
  ): Promise<Invoice[]> {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.searchInvoices(
        user.merchantId,
        query.q,
        query.limit ?? 20,
      ),
    );
  }

  /**
   * Get a single invoice by ID (authenticated merchant only)
   * @param id - Invoice UUID
   * @returns The invoice object
   */
  @Auth()
  @Get(":id")
  async findOne(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.findOne(id, user.merchantId),
    );
  }

  /**
   * Get public invoice view for payers (no authentication required)
   * Returns only payer-safe fields with merchant branding
   * @param id - Invoice UUID
   * @returns Public invoice data
   */
  @Public()
  @Get("public/:id")
  @Throttle({ default: { limit: 60, ttl: 60_000 } }) // 60 requests per minute
  async findPublicInvoice(@Param("id") id: string) {
    const invoice = await this.invoicesService.findPublicInvoice(id);
    if (!invoice) {
      throw new BadRequestException("Invoice not found");
    }
    return invoice;
  }

  /**
   * Create a new invoice
   * Requires a valid JWT Bearer token.
   * @param dto - Create invoice data
   * @returns The created invoice including payment instructions
   */
  @Post()
  @Auth()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } }) // 20 invoices per hour per user
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateInvoiceDto,
  ): Promise<Invoice> {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.create(dto, user.id, user.merchantId),
    );
  }

  /**
   * Bulk import invoices from a CSV file.
   * Invalid rows are reported without losing valid rows.
   * Requires a valid JWT Bearer token.
   * @param file - Uploaded CSV file (multipart field name "file")
   * @returns Import summary with created/failed/skipped row counts
   */
  @Post("import")
  @Auth()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 imports per hour per user
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isCsv =
          file.mimetype === "text/csv" ||
          file.mimetype === "application/vnd.ms-excel" ||
          file.originalname.toLowerCase().endsWith(".csv");
        if (!isCsv) {
          cb(new BadRequestException("Only .csv files are accepted"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async importCsv(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportSummaryDto> {
    if (!file) {
      throw new BadRequestException("CSV file is required");
    }
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.importFromCsv(file.buffer, user.id, user.merchantId),
    );
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status ('pending', 'paid', 'overdue', 'cancelled')
   * @returns Updated invoice
   */
  @Auth()
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body("status") status: InvoiceStatus,
  ): Promise<Invoice> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.updateStatus(id, status, user.merchantId),
    );
  }

  /**
   * Cancel an unpaid invoice.
   * Only pending or overdue invoices may be cancelled.
   * @param id     - Invoice UUID
   * @param reason - Optional reason string (defaults to "cancelled")
   * @returns      - { id, status, reason, cancelledAt }
   */
  @Auth()
  @Patch(":id/cancel")
  async cancelInvoice(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body("reason") reason?: string,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.cancelInvoice(
        id,
        user.merchantId,
        reason ?? "cancelled",
      ),
    );
  }

  /**
   * Void an unpaid invoice (alias for cancel with reason "voided").
   * Semantically indicates the invoice was created in error.
   * @param id     - Invoice UUID
   * @param reason - Optional reason string (defaults to "voided")
   * @returns      - { id, status, reason, cancelledAt }
   */
  @Auth()
  @Patch(":id/void")
  async voidInvoice(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body("reason") reason?: string,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.cancelInvoice(
        id,
        user.merchantId,
        reason ?? "voided",
      ),
    );
  }

  /**
   * Duplicate an existing invoice to create a new invoice with the same details
   * @param id - Invoice UUID to duplicate
   * @returns The duplicated invoice
   */
  @Auth()
  @Post(":id/duplicate")
  async duplicateInvoice(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.duplicateInvoice(id, user.merchantId, user.id),
    );
  }

  /**
   * Get all payment reviews for the authenticated merchant
   */
  @Auth()
  @Get("reviews/queue")
  async getReviews(
    @CurrentUser() user: User,
    @Query("status") status?: string,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.paymentReviewsService.findAll(user.merchantId, status),
    );
  }

  /**
   * Resolve a payment review
   */
  @Auth()
  @Post("reviews/:id/resolve")
  async resolveReview(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() data: ResolveReviewDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.paymentReviewsService.resolve(id, user.merchantId, data),
    );
  }

  // ==================== DRAFT ENDPOINTS ====================

  /**
   * Create a new draft invoice
   * All fields are optional, can be saved as partial data
   */
  @Post("draft")
  @Auth()
  async createDraft(
    @CurrentUser() user: User,
    @Body() dto: CreateDraftDto,
  ): Promise<DraftResponseDto> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.createDraft(dto, user.id, user.merchantId),
    );
  }

  /**
   * Get all drafts for the authenticated merchant
   */
  @Auth()
  @Get("draft")
  async getDrafts(
    @CurrentUser() user: User,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<{
    items: DraftResponseDto[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.getDrafts(user.merchantId, p, l),
    );
  }

  /**
   * Get a specific draft by ID
   */
  @Auth()
  @Get("draft/:id")
  async getDraft(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<DraftResponseDto> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.getDraft(id, user.merchantId),
    );
  }

  /**
   * Auto-save a draft (for regular autosave polling)
   * This endpoint is optimized for frequent calls
   */
  @Auth()
  @Patch("draft/:id/autosave")
  async autoSaveDraft(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() updates: UpdateDraftDto,
  ): Promise<DraftResponseDto> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.autoSaveDraft(id, updates, user.id, user.merchantId),
    );
  }

  /**
   * Update a draft (full update, for manual saves)
   */
  @Auth()
  @Patch("draft/:id")
  async updateDraft(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<DraftResponseDto> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.updateDraft(id, dto, user.id, user.merchantId),
    );
  }

  /**
   * Convert a draft to a real invoice
   * Requires all required fields to be filled
   */
  @Auth()
  @Post("draft/:id/convert")
  async convertDraftToInvoice(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<Invoice> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.convertDraftToInvoice(id, user.merchantId, user.id),
    );
  }

  /**
   * Discard/delete a draft
   */
  @Auth()
  @Delete("draft/:id")
  async discardDraft(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<{ id: string; discarded: boolean }> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.draftService.discardDraft(id, user.merchantId),
    );
  }
}
