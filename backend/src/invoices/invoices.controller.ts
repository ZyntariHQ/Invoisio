import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { SearchInvoicesDto } from "./dto/search-invoices.dto";
import { Invoice } from "./entities/invoice.entity";
import { AuthGuard } from "../auth/auth.guard";
import { InvoiceStatus } from "@prisma/client";
import type { Request } from "express";

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
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * Get all invoices
   * @returns Array of all invoices
   */
  @Get()
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<Invoice[]> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    const result = await this.invoicesService.findAll(p, l);
    return result.items;
  }

  /**
   * Search invoices by client name, email, or memo for the authenticated merchant
   * @returns Array of matching invoices ordered by relevance
   */
  @Get("search")
  @UseGuards(AuthGuard)
  async search(
    @Query() query: SearchInvoicesDto,
    @Req() req: Request,
  ): Promise<Invoice[]> {
    const user = req["user"] as { sub?: string } | undefined;
    const userId = user?.sub;
    return await this.invoicesService.searchInvoices(
      userId,
      query.q,
      query.limit ?? 20,
    );
  }

  /**
   * Get a single invoice by ID
   * @param id - Invoice UUID
   * @returns The invoice object
   */
  @Get(":id")
  async findOne(@Param("id") id: string): Promise<Invoice> {
    return await this.invoicesService.findOne(id);
  }

  /**
   * Create a new invoice
   * Requires a valid JWT Bearer token.
   * @param dto - Create invoice data
   * @returns The created invoice including payment instructions
   */
  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 20, ttl: 3600 } }) // 20 invoices per hour per user
  async create(@Body() dto: CreateInvoiceDto): Promise<Invoice> {
    return await this.invoicesService.create(dto);
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status ('pending', 'paid', 'overdue', 'cancelled')
   * @returns Updated invoice
   */
  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body("status") status: InvoiceStatus,
  ): Promise<Invoice> {
    return this.invoicesService.updateStatus(id, status);
  }
}
