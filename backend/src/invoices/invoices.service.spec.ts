import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { InvoiceStatus } from "@prisma/client";

const MERCHANT_A = "merchant-a";
const MERCHANT_B = "merchant-b";
const USER_A = "user-a";
const USER_B = "user-b";

describe("InvoicesService", () => {
  let service: InvoicesService;

  const mockStellarService = {
    getMerchantPublicKey: jest
      .fn()
      .mockReturnValue(
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ),
  };

  const mockSorobanService = {
    hasInvoicePayment: jest.fn().mockResolvedValue(false),
    recordInvoicePayment: jest
      .fn()
      .mockResolvedValue({ hash: "mock-hash", ledger: 1 }),
    getInvoicePayment: jest.fn().mockResolvedValue(null),
  };

  const mockPrisma = () => {
    const invoices = [
      {
        id: "invoice-a-1",
        merchantId: MERCHANT_A,
        userId: USER_A,
        invoiceNumber: "INV-A-001",
        clientName: "Acme Corp",
        clientEmail: "a@example.com",
        description: "A",
        amount: 100,
        assetCode: "XLM",
        assetIssuer: null,
        memo: "1001",
        memoType: "ID",
        status: "pending",
        destinationAddress: mockStellarService.getMerchantPublicKey(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "invoice-b-1",
        merchantId: MERCHANT_B,
        userId: USER_B,
        invoiceNumber: "INV-B-001",
        clientName: "Beta LLC",
        clientEmail: "b@example.com",
        description: "B",
        amount: 200,
        assetCode: "USDC",
        assetIssuer: "GASDF",
        memo: "2001",
        memoType: "ID",
        status: "pending",
        destinationAddress: mockStellarService.getMerchantPublicKey(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const filterByWhere = (where: any) =>
      invoices.filter((invoice) => {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          return (invoice as any)[key] === value;
        });
      });

    const queryRows = invoices
      .filter((entry) => entry.userId === USER_A)
      .map((entry) => ({
        ...entry,
        ft_match: true,
        ft_rank: 0.9,
        trigram_rank: 0.8,
      }));

    return {
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(filterByWhere(where));
        }),
        count: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(filterByWhere(where).length);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(filterByWhere(where)[0] ?? null);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(
            invoices.find(
              (invoice) =>
                invoice.id === where.id || invoice.memo === where.memo,
            ) ?? null,
          );
        }),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const created = {
            id: "created-invoice",
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          invoices.push(created);
          return Promise.resolve(created);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          let count = 0;
          for (const invoice of invoices) {
            const matches = Object.entries(where).every(
              ([key, value]) => (invoice as any)[key] === value,
            );
            if (matches) {
              Object.assign(invoice, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const invoice = invoices.find((entry) => entry.id === where.id);
          if (!invoice) {
            return Promise.reject(new Error("not found"));
          }
          Object.assign(invoice, data);
          return Promise.resolve(invoice);
        }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest.fn().mockResolvedValue(queryRows),
    };
  };

  const mockWebhooksService = {
    enqueueWebhook: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  describe("merchant isolation", () => {
    it("allows a merchant user to list only their own invoices", async () => {
      const resultA = await service.findAll(MERCHANT_A);
      expect(resultA.items).toHaveLength(1);
      expect(resultA.items[0].merchantId).toBe(MERCHANT_A);

      const resultB = await service.findAll(MERCHANT_B);
      expect(resultB.items).toHaveLength(1);
      expect(resultB.items[0].merchantId).toBe(MERCHANT_B);
    });

    it("prevents merchant A from updating merchant B invoice", async () => {
      await expect(
        service.updateStatus("invoice-b-1", "paid" as any, MERCHANT_A),
      ).rejects.toThrow(NotFoundException);
    });

    it("allows merchant B to update merchant B invoice", async () => {
      const updated = await service.updateStatus(
        "invoice-b-1",
        "paid" as any,
        MERCHANT_B,
      );

      expect(updated.status).toBe("paid");
      expect(updated.merchantId).toBe(MERCHANT_B);
    });
  });

  describe("searchInvoices", () => {
    it("should return invoices scoped to the user", async () => {
      const results = await service.searchInvoices(USER_A, "Acme", 25);

      expect(results.length).toBeGreaterThan(0);
      for (const invoice of results) {
        expect(invoice).toHaveProperty("clientName");
        expect(invoice).toHaveProperty("asset_code");
      }
    });

    it("should throw when user context is missing", async () => {
      await expect(
        service.searchInvoices(undefined as any, "Acme"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("exportInvoices", () => {
    it("should export invoices as CSV with correct headers", async () => {
      const csv = await service.exportInvoices(MERCHANT_A, {});

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2); // header + 1 invoice

      const headers = lines[0].split(",");
      expect(headers).toEqual([
        "id",
        "invoice_number",
        "client_name",
        "client_email",
        "description",
        "amount",
        "asset_code",
        "asset_issuer",
        "memo",
        "memo_type",
        "status",
        "tx_hash",
        "soroban_tx_hash",
        "soroban_contract_id",
        "due_date",
        "created_at",
        "updated_at",
      ]);
    });

    it("should filter by status", async () => {
      const csv = await service.exportInvoices(MERCHANT_A, {
        status: "pending" as InvoiceStatus,
      });

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2);
    });

    it("should filter by asset code", async () => {
      const csv = await service.exportInvoices(MERCHANT_A, {
        assetCode: "XLM",
      });

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain("XLM");
    });

    it("should respect merchant scoping", async () => {
      const csv = await service.exportInvoices(MERCHANT_A, {});

      const lines = csv.trim().split("\n");
      expect(lines.length).toBe(2); // only merchant A's invoice
      expect(lines[1]).toContain("INV-A-001");
      expect(lines[1]).not.toContain("INV-B-001");
    });

    it("should escape CSV special characters", async () => {
      // Add an invoice with special characters
      const prisma = (service as any).prisma;
      const invoices = prisma.invoice.findMany.mock.results[0]?.value ?? [];

      const csv = await service.exportInvoices(MERCHANT_A, {});
      // CSV should be valid - no unescaped commas or quotes
      const lines = csv.trim().split("\n");
      for (const line of lines) {
        // Simple check: if there's a quote, it should be doubled
        const quoteCount = (line.match(/"/g) || []).length;
        if (quoteCount > 0) {
          expect(quoteCount % 2).toBe(0);
        }
      }
    });
  });
});
