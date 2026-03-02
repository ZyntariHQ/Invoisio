import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Invoice } from "./entities/invoice.entity";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { StellarService } from "../stellar/stellar.service";
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

  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
  ) {
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
   * @returns The created invoice including payment instructions
   */
  create(dto: CreateInvoiceDto): Invoice {
    const id = uuidv4();
    const now = new Date();

    const invoice: Invoice = {
      id,
      invoiceNumber: dto.invoiceNumber,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      description: dto.description || "",
      amount: dto.amount,
      asset_code: dto.asset_code.toUpperCase(),
      asset_issuer: dto.asset_issuer,
      memo: this.generateMemoId(),
      memo_type: "ID",
      status: "pending",
      destination_address: this.stellarService.getMerchantPublicKey(),
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
   * @param memo - Stellar memo ID string
   * @returns Invoice or undefined if not found
   */
  findByMemo(memo: string): Invoice | undefined {
    return Array.from(this.invoices.values()).find(
      (invoice) => invoice.memo === memo,
    );
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

  /**
   * Seed sample invoices for demonstration purposes
   */
  private seedSampleInvoices(): void {
    const merchantPublicKey =
      this.stellarService.getMerchantPublicKey() ||
      "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

    const sampleInvoices: Invoice[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        invoiceNumber: "INV-001",
        clientName: "Acme Corporation",
        clientEmail: "billing@acme.com",
        description: "Web development services - March 2026",
        amount: 1500.0,
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        memo: this.generateMemoId(),
        memo_type: "ID",
        status: "pending",
        destination_address: merchantPublicKey,
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
        asset_code: "XLM",
        memo: this.generateMemoId(),
        memo_type: "ID",
        status: "paid",
        destination_address: merchantPublicKey,
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
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        memo: this.generateMemoId(),
        memo_type: "ID",
        status: "overdue",
        destination_address: merchantPublicKey,
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
