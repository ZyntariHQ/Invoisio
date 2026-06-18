import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";

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

    const statusHistories: any[] = [
      {
        id: "hist-a-1",
        invoiceId: "invoice-a-1",
        status: "pending",
        createdAt: new Date(Date.now() - 10000),
      },
      {
        id: "hist-b-1",
        invoiceId: "invoice-b-1",
        status: "pending",
        createdAt: new Date(Date.now() - 10000),
      },
    ];

    const populateHistory = (invoice: any) => {
      if (!invoice) return null;
      const history = statusHistories
        .filter((h) => h.invoiceId === invoice.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return {
        ...invoice,
        statusHistory: history,
      };
    };

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
      invoiceStatusHistory: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const entry = {
            id: `hist-${Math.random()}`,
            ...data,
            createdAt: new Date(),
          };
          statusHistories.push(entry);
          return Promise.resolve(entry);
        }),
      },
      invoice: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(filterByWhere(where).map(populateHistory));
        }),
        count: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(filterByWhere(where).length);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          return Promise.resolve(populateHistory(filterByWhere(where)[0] ?? null));
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const inv = invoices.find(
            (invoice) =>
              invoice.id === where.id || invoice.memo === where.memo,
          );
          return Promise.resolve(populateHistory(inv ?? null));
        }),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const { statusHistory, ...rest } = data;
          const created = {
            id: "created-invoice",
            ...rest,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          invoices.push(created);
          if (statusHistory && statusHistory.create) {
            statusHistories.push({
              id: `hist-${Math.random()}`,
              invoiceId: created.id,
              status: statusHistory.create.status,
              createdAt: new Date(),
            });
          }
          return Promise.resolve(populateHistory(created));
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          let count = 0;
          for (const invoice of invoices) {
            const matches = Object.entries(where).every(
              ([key, value]) => (invoice as any)[key] === value,
            );
            if (matches) {
              const { statusHistory, ...rest } = data;
              Object.assign(invoice, rest);
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
          const { statusHistory, ...rest } = data;
          Object.assign(invoice, rest);
          if (statusHistory && statusHistory.create) {
            statusHistories.push({
              id: `hist-${Math.random()}`,
              invoiceId: invoice.id,
              status: statusHistory.create.status,
              createdAt: new Date(),
            });
          }
          return Promise.resolve(populateHistory(invoice));
        }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest.fn().mockResolvedValue(queryRows.map(populateHistory)),
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

  describe("cancelInvoice", () => {
    it("cancels a pending invoice and returns status + reason", async () => {
      const result = await service.cancelInvoice(
        "invoice-a-1",
        MERCHANT_A,
        "customer request",
      );
      expect(result.status).toBe("cancelled");
      expect(result.reason).toBe("customer request");
      expect(result.id).toBe("invoice-a-1");
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it("uses default reason 'cancelled' when none is supplied", async () => {
      const result = await service.cancelInvoice("invoice-b-1", MERCHANT_B);
      expect(result.reason).toBe("cancelled");
    });

    it("throws NotFoundException when invoice belongs to a different merchant", async () => {
      await expect(
        service.cancelInvoice("invoice-b-1", MERCHANT_A),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException for a non-existent invoice", async () => {
      await expect(
        service.cancelInvoice("no-such-id", MERCHANT_A),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when the invoice is already paid", async () => {
      // First pay the invoice via updateStatus, then attempt to cancel it
      await service.updateStatus("invoice-a-1", "paid" as any, MERCHANT_A);
      await expect(
        service.cancelInvoice("invoice-a-1", MERCHANT_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the invoice is already cancelled", async () => {
      await service.cancelInvoice("invoice-a-1", MERCHANT_A);
      await expect(
        service.cancelInvoice("invoice-a-1", MERCHANT_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("enqueues a webhook after cancellation", async () => {
      const webhookSpy = jest.spyOn(
        (service as any).webhooksService,
        "enqueueWebhook",
      );
      await service.cancelInvoice("invoice-a-1", MERCHANT_A, "test");
      expect(webhookSpy).toHaveBeenLastCalledWith(
        "invoice-a-1",
        "cancelled",
        undefined,
        MERCHANT_A,
      );
    });
  });

  describe("findByMemo", () => {
    it("returns null for a cancelled invoice (reconciliation guard)", async () => {
      // Cancel invoice-a-1 first
      await service.cancelInvoice("invoice-a-1", MERCHANT_A);
      const found = await service.findByMemo("1001");
      expect(found).toBeNull();
    });

    it("returns the invoice for a non-cancelled memo", async () => {
      const found = await service.findByMemo("1001");
      expect(found).not.toBeNull();
      expect(found!.memo).toBe("1001");
    });
  });

  describe("reconcilePayment", () => {
    it("throws BadRequestException when attempting to pay a cancelled invoice", async () => {
      await service.cancelInvoice("invoice-a-1", MERCHANT_A);
      await expect(
        service.reconcilePayment(
          "invoice-a-1",
          "GPAYER",
          "XLM",
          "",
          "1000000",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("status history audit trail", () => {
    it("creates a status history entry on invoice creation", async () => {
      const created = await service.create(
        {
          invoiceNumber: "INV-NEW-99",
          clientName: "New Client",
          clientEmail: "new@example.com",
          amount: 500,
          asset_code: "XLM",
        },
        USER_A,
        MERCHANT_A,
      );

      expect(created.statusHistory).toBeDefined();
      expect(created.statusHistory).toHaveLength(1);
      expect(created.statusHistory![0].status).toBe("pending");
    });

    it("appends status history entry on updateStatus", async () => {
      const updated = await service.updateStatus(
        "invoice-a-1",
        "paid" as any,
        MERCHANT_A,
      );

      expect(updated.statusHistory).toBeDefined();
      expect(updated.statusHistory!.map((h) => h.status)).toContain("paid");
    });

    it("appends status history entry on cancelInvoice", async () => {
      const result = await service.cancelInvoice("invoice-a-1", MERCHANT_A);
      expect(result.status).toBe("cancelled");

      const detail = await service.findOne("invoice-a-1", MERCHANT_A);
      expect(detail.statusHistory).toBeDefined();
      expect(detail.statusHistory!.map((h) => h.status)).toContain("cancelled");
    });

    it("appends status history entry on markAsPaid", async () => {
      const updated = await service.markAsPaid("invoice-a-1", "tx-xyz");
      expect(updated.status).toBe("paid");
      expect(updated.statusHistory!.map((h) => h.status)).toContain("paid");
    });

    it("appends status history entry on updateSorobanMetadata (anchored)", async () => {
      const updated = await service.updateSorobanMetadata("invoice-a-1", "soroban-tx", "contract-123");
      expect(updated.statusHistory!.map((h) => h.status)).toContain("anchored");
    });
  });
});
