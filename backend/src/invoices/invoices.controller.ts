import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { Invoice } from "./entities/invoice.entity";
import { AuthGuard } from "../auth/auth.guard";

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
   * @param page - Page number (default: 1)
   * @param limit - Number of items per page (default: 10)
   * @returns Array of invoices
   */
  @Get()
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<{ data: Invoice[]; meta: any }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.invoicesService.findAll(pageNum, limitNum);
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
    @Body("status") status: Invoice["status"],
  ): Promise<Invoice> {
    return this.invoicesService.updateStatus(id, status);
  }
}
