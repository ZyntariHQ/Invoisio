import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Invoice } from "./entities/invoice.entity";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { v4 as uuidv4 } from "uuid";

/**
 * Invoices service with in-memory storage
 *
 * Note: This is a stub implementation using in-memory storage.
 * Future iterations will integrate with a database (PostgreSQL via Prisma)
 * and the StellarModule for Horizon payment watching.
 */
@Injectable()
export class InvoicesService {
  private invoices: Map<string, Invoice> = new Map();

  constructor(private readonly configService: ConfigService) {
    // Pre-populate with sample invoices for demonstration
    this.seedSampleInvoices();
  }

  /**
   * Get all invoices as an array
   * @returns Array of all invoices
   */
  findAll(): Invoice[] {
    return Array.from(this.invoices.values());
  }

  /**
   * Find a single invoice by ID
   * @param id - Invoice UUID
   * @returns The invoice object
   * @throws NotFoundException if invoice not found
   */
  findOne(id: string): Invoice {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${id}" not found`);
    }
    return invoice;
  }

  /**
   * Create a new invoice
   * @param dto - Create invoice DTO
   * @returns The created invoice
   */
  create(dto: CreateInvoiceDto): Invoice {
    const stellarConfig = this.configService.get("stellar");
    const merchantPublicKey = stellarConfig?.merchantPublicKey || "";
    const memoPrefix = stellarConfig?.memoPrefix || "invoisio-";

    const id = uuidv4();
    const now = new Date();

    const invoice: Invoice = {
      id,
      invoiceNumber: dto.invoiceNumber,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      description: dto.description || "",
      amount: dto.amount,
      asset: dto.asset,
      memo: `${memoPrefix}${id}`,
      status: "pending",
      destination: dto.destination || merchantPublicKey,
      createdAt: now,
      updatedAt: now,
      dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    };

    this.invoices.set(id, invoice);
    return invoice;
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status
   * @returns Updated invoice
   */
  updateStatus(id: string, status: Invoice["status"]): Invoice {
    const invoice = this.findOne(id);
    invoice.status = status;
    invoice.updatedAt = new Date();
    this.invoices.set(id, invoice);
    return invoice;
  }

  /**
   * Find invoice by memo (for payment matching)
   * @param memo - Stellar memo string
   * @returns Invoice or undefined if not found
   */
  findByMemo(memo: string): Invoice | undefined {
    return Array.from(this.invoices.values()).find(
      (invoice) => invoice.memo === memo,
    );
  }

  /**
   * Seed sample invoices for demonstration purposes
   */
  private seedSampleInvoices(): void {
    const stellarConfig = this.configService.get("stellar");
    const merchantPublicKey =
      stellarConfig?.merchantPublicKey ||
      "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const memoPrefix = stellarConfig?.memoPrefix || "invoisio-";

    const sampleInvoices: Invoice[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        invoiceNumber: "INV-001",
        clientName: "Acme Corporation",
        clientEmail: "billing@acme.com",
        description: "Web development services - March 2026",
        amount: 1500.0,
        asset: "USDC",
        memo: `${memoPrefix}550e8400-e29b-41d4-a716-446655440000`,
        status: "pending",
        destination: merchantPublicKey,
        createdAt: new Date("2026-03-01T10:00:00Z"),
        updatedAt: new Date("2026-03-01T10:00:00Z"),
        dueDate: new Date("2026-03-31T23:59:59Z"),
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        invoiceNumber: "INV-002",
        clientName: "TechStart Inc",
        clientEmail: "payments@techstart.io",
        description: "Consulting services - Q1 2026",
        amount: 5000.0,
        asset: "XLM",
        memo: `${memoPrefix}550e8400-e29b-41d4-a716-446655440001`,
        status: "paid",
        destination: merchantPublicKey,
        createdAt: new Date("2026-02-15T14:30:00Z"),
        updatedAt: new Date("2026-02-20T09:15:00Z"),
        dueDate: new Date("2026-03-15T23:59:59Z"),
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        invoiceNumber: "INV-003",
        clientName: "Global Solutions Ltd",
        clientEmail: "accounts@globalsolutions.com",
        description: "API integration project",
        amount: 3200.5,
        asset: "USDC",
        memo: `${memoPrefix}550e8400-e29b-41d4-a716-446655440002`,
        status: "overdue",
        destination: merchantPublicKey,
        createdAt: new Date("2026-01-10T08:00:00Z"),
        updatedAt: new Date("2026-02-10T16:45:00Z"),
        dueDate: new Date("2026-02-10T23:59:59Z"),
      },
    ];

    for (const invoice of sampleInvoices) {
      this.invoices.set(invoice.id, invoice);
    }
  }
}
