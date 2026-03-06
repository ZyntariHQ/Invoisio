import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
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
export class InvoicesService implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
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
        metadata: null,
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
  async updateStatus(id: string, status: Invoice["status"]): Promise<Invoice> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status },
    });
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
          metadata: null,
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
          metadata: null,
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
          metadata: null,
          dueDate: new Date("2026-02-10T23:59:59Z"),
        },
      ],
    });
  }
}
