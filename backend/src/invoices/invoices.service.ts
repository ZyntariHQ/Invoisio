import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Invoice } from "./entities/invoice.entity";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { StellarService } from "../stellar/stellar.service";
import { PrismaService } from "../prisma/prisma.service";
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
  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly prisma: PrismaService,
  ) {
    // Ensure sample invoices exist in DB for demo/dev
    this.seedSampleInvoices();
  }

  /**
   * Get all invoices as an array
   * @returns Array of all invoices
   */
  async findAll(): Promise<Invoice[]> {
    const invoices = await this.prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
    });
    // attach destination address for compatibility with existing DTOs
    return invoices.map((inv) => ({
      ...inv,
      destination_address: this.stellarService.getMerchantPublicKey(),
    }));
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
    return {
      ...invoice,
      destination_address: this.stellarService.getMerchantPublicKey(),
    };
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
        asset_code: dto.asset_code.toUpperCase(),
        asset_issuer: dto.asset_issuer ?? undefined,
        memo: memo,
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        metadata: null,
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      ...created,
      destination_address: this.stellarService.getMerchantPublicKey(),
    };
  }

  /**
   * Update invoice status
   * @param id - Invoice UUID
   * @param status - New status
   * @returns Updated invoice
   */
  async updateStatus(id: string, status: Invoice["status"]): Promise<Invoice> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status },
    });
    return updated;
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
    return invoice;
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
          asset_code: "USDC",
          asset_issuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          memo: this.generateMemoId(),
          memo_type: "ID",
          status: "pending",
          tx_hash: null,
          metadata: null,
          dueDate: new Date("2026-03-31T23:59:59Z"),
        },
        {
          invoiceNumber: "INV-002",
          clientName: "TechStart Inc",
          clientEmail: "payments@techstart.io",
          description: "Consulting services - Q1 2026",
          amount: 5000.0 as any,
          asset_code: "XLM",
          memo: this.generateMemoId(),
          memo_type: "ID",
          status: "paid",
          tx_hash: null,
          metadata: null,
          dueDate: new Date("2026-03-15T23:59:59Z"),
        },
        {
          invoiceNumber: "INV-003",
          clientName: "Global Solutions Ltd",
          clientEmail: "accounts@globalsolutions.com",
          description: "API integration project",
          amount: 3200.5 as any,
          asset_code: "USDC",
          asset_issuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          memo: this.generateMemoId(),
          memo_type: "ID",
          status: "overdue",
          tx_hash: null,
          metadata: null,
          dueDate: new Date("2026-02-10T23:59:59Z"),
        },
      ],
    });
  }
}
