import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { SearchInvoicesDto } from "./dto/search-invoices.dto";
import { Invoice } from "./entities/invoice.entity";
import { InvoiceStatus } from "@prisma/client";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";

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
  ): Promise<Invoice[]> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const result = await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.findAll(user.merchantId, p, l),
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
      this.invoicesService.searchInvoices(user.id, query.q, query.limit ?? 20),
    );
  }

  /**
   * Get a single invoice by ID
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
   * Create a new invoice
   * Requires a valid JWT Bearer token.
   * @param dto - Create invoice data
   * @returns The created invoice including payment instructions
   */
  @Post()
  @Auth()
  @Throttle({ default: { limit: 20, ttl: 3600 } }) // 20 invoices per hour per user
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateInvoiceDto,
  ): Promise<Invoice> {
    return await this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.invoicesService.create(dto, user.id, user.merchantId),
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
}
