import { Controller, Get, Post, Body, Param, Patch } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { Invoice } from "./entities/invoice.entity";

/**
 * Invoices controller
 * Manages invoice creation, retrieval, and status updates
 *
 * Future enhancements:
 * - Add authentication guards (JWT)
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
  findAll(): Invoice[] {
    return this.invoicesService.findAll();
  }

  /**
   * Get a single invoice by ID
   * @param id - Invoice UUID
   * @returns The invoice object
   */
  @Get(":id")
  findOne(@Param("id") id: string): Invoice {
    return this.invoicesService.findOne(id);
  }

  /**
   * Create a new invoice
   * @param dto - Create invoice data
   * @returns The created invoice
   */
  @Post()
  create(@Body() dto: CreateInvoiceDto): Invoice {
    return this.invoicesService.create(dto);
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
  ): Invoice {
    return this.invoicesService.updateStatus(id, status);
  }
}
