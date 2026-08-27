import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

const MERCHANT_A = "merchant-a";
const MERCHANT_B = "merchant-b";
const USER_A = "user-a";
const USER_A2 = "user-a2"; // second teammate under MERCHANT_A
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
        // Real rows always have a concrete isDraft value (schema default
        // is `false`) — set it explicitly here so the mock matches
        // production data instead of leaving it `undefined`.
        isDraft: false,
        destinationAddress: mockStellarService.getMerchantPublicKey(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        // Created by a *different* teammate (USER_A2) under the same
        // merchant as invoice-a-1 — exercises the shared-merchant search
        // scenario this fix is about.
        id: "invoice-a-2",
        merchantId: MERCHANT_A,
        userId: USER_A2,
        invoiceNumber: "INV-A-002",
        clientName: "Acme Widgets",
        clientEmail: "widgets@example.com",
        description: "A2",
        amount: 150,
        assetCode: "XLM",
        assetIssuer: null,
        memo: "1002",
        memoType: "ID",
        status: "pending",
        isDraft: false,
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
        isDraft: false,
        destinationAddress: mockStellarService.getMerchantPublicKey(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "invoice-a-draft",
        merchantId: MERCHANT_A,
        userId: USER_A,
        invoiceNumber: "DRAFT-001",
        clientName: "Untitled Client",
        clientEmail: "",
        description: "not yet published",
        amount: 300,
        assetCode: "XLM",
        assetIssuer: null,
        memo: "draft-memo-1",
        memoType: "ID",
        status: "draft",
        // Real draft rows set isDraft: true explicitly (DraftService), but
        // the public-invoice fix intentionally gates on `status`, not
        // `isDraft` — see the comment on PUBLIC_SAFE_INVOICE_STATUSES.
        isDraft: true,
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
        id: "hist-a-2",
        invoiceId: "invoice-a-2",
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

    // Mirrors real Prisma's `where` semantics: a key explicitly set to
    // `undefined` (e.g. `{ isDraft: includeDrafts ? undefined : false }`)
    // means "don't filter on this field", not "match rows where this
    // field is undefined". Without this, the mock diverges from actual
    // Prisma behavior and produces false negatives in tests.
    const filterByWhere = (where: any) =>
      invoices.filter((invoice) => {
        if (!where) return true;
        return Object.entries(where).every(([key, value]) => {
          if (value === undefined) return true;
          return (invoice as any)[key] === value;
        });
      });

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
          return Promise.resolve(
            populateHistory(filterByWhere(where)[0] ?? null),
          );
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const inv = invoices.find(
            (invoice) => invoice.id === where.id || invoice.memo === where.memo,
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
      $queryRaw: jest.fn().mockImplementation((sql: any) => {
        // sql.values[0] is the first interpolated param in the tagged
        // template, i.e. merchantId — matches the service's
        // `WHERE i."merchant_id" = ${merchantId}` binding.
        const merchantId = sql?.values?.[0];
        const rows = invoices
          .filter((entry) => entry.merchantId === merchantId)
          .map((entry) => ({
            ...entry,
            ft_match: true,
            ft_rank: 0.9,
            trigram_rank: 0.8,
          }));
        return Promise.resolve(rows.map(populateHistory));
      }),
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
        {
          provide: NotificationsService,
          useValue: {
            notifyInvoicePaid: jest.fn(),
            notifyInvoiceOverdue: jest.fn(),
          },
        },
        {
          provide: StructuredLogger,
          useValue: mockStructuredLogger,
        },
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
      // MERCHANT_A now has two invoices in the fixture (invoice-a-1,
      // invoice-a-2 — created by different teammates), both of which
      // must be visible to any MERCHANT_A caller.
      expect(resultA.items).toHaveLength(2);
      for (const item of resultA.items) {
        expect(item.merchantId).toBe(MERCHANT_A);
      }

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

  describe("exportCsv", () => {
    it("exports the requested invoice fields as CSV for the merchant", async () => {
      const prisma = (service as any).prisma;
      prisma.invoice.count.mockResolvedValue(1);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "invoice-a-1",
          merchantId: MERCHANT_A,
          invoiceNumber: "INV-A-001",
          clientName: "Acme Corp",
          amount: 100,
          assetCode: "XLM",
          status: "pending",
          dueDate: new Date("2026-08-30T00:00:00.000Z"),
        },
      ]);

      const result = await service.exportCsv(MERCHANT_A, {
        status: "pending",
        asset: "XLM",
        q: "Acme",
      });

      const csv = result.buffer.toString("utf8");
      expect(csv).toContain(
        "Invoice Number,Customer,Amount,Asset,Status,Due Date",
      );
      expect(csv).toContain(
        '"INV-A-001","Acme Corp","100","XLM","pending","2026-08-30"',
      );
      expect(result.count).toBe(1);
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: MERCHANT_A,
            status: "pending",
            assetCode: { equals: "XLM", mode: "insensitive" },
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("rejects unsupported due-date filters", async () => {
      await expect(
        service.exportCsv(MERCHANT_A, { dueDate: "tomorrow" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects exports larger than the safety limit", async () => {
      const prisma = (service as any).prisma;
      prisma.invoice.count.mockResolvedValue(10001);

      await expect(service.exportCsv(MERCHANT_A, {})).rejects.toThrow(
        /exports are limited to 10000 rows/,
      );
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });
  });

  describe("searchInvoices", () => {
    it("should return invoices scoped to the merchant", async () => {
      const results = await service.searchInvoices(MERCHANT_A, "Acme", 25);

      expect(results.length).toBeGreaterThan(0);
      for (const invoice of results) {
        expect(invoice).toHaveProperty("clientName");
        expect(invoice).toHaveProperty("asset_code");
        expect(invoice.merchantId).toBe(MERCHANT_A);
      }
    });

    it("allows a teammate to find invoices created by a different user in the same merchant", async () => {
      // invoice-a-2 was created by USER_A2, not USER_A — a teammate
      // searching under the shared MERCHANT_A account must still find it.
      const results = await service.searchInvoices(MERCHANT_A, "Widgets", 25);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((inv) => inv.id === "invoice-a-2")).toBe(true);
      expect(results.every((inv) => inv.merchantId === MERCHANT_A)).toBe(true);
    });

    it("does not leak invoices across merchants even with a matching search term", async () => {
      // Search as MERCHANT_A for a term that only matches MERCHANT_B's data.
      const results = await service.searchInvoices(MERCHANT_A, "Beta", 25);
      expect(results.every((inv) => inv.merchantId !== MERCHANT_B)).toBe(true);
      expect(results.find((inv) => inv.id === "invoice-b-1")).toBeUndefined();
    });

    it("should throw when merchant context is missing", async () => {
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

  describe("findPublicInvoice", () => {
    it("returns null for a draft invoice, never exposing its details", async () => {
      const found = await service.findPublicInvoice("invoice-a-draft");
      expect(found).toBeNull();
    });

    it("returns null for a cancelled invoice", async () => {
      await service.cancelInvoice("invoice-a-1", MERCHANT_A);
      const found = await service.findPublicInvoice("invoice-a-1");
      expect(found).toBeNull();
    });

    it("returns null for an unknown invoice ID", async () => {
      const found = await service.findPublicInvoice("does-not-exist");
      expect(found).toBeNull();
    });

    it("returns payer-safe fields for a pending (published) invoice", async () => {
      const found = await service.findPublicInvoice("invoice-a-1");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("invoice-a-1");
      expect(found!.status).toBe("pending");
      expect(found!.amount).toBeDefined();
    });

    it("returns partially_paid, paid, and overdue invoices", async () => {
      for (const status of ["partially_paid", "paid", "overdue"] as const) {
        await service.updateStatus("invoice-a-1", status, MERCHANT_A);
        const found = await service.findPublicInvoice("invoice-a-1");
        expect(found).not.toBeNull();
        expect(found!.status).toBe(status);
      }
    });

    it("does not leak draft-only fields when access is denied", async () => {
      const found = await service.findPublicInvoice("invoice-a-draft");
      expect(found).toBeNull();
      // A null response is indistinguishable from "unknown ID" — the
      // caller (controller) must not learn the invoice exists but is
      // merely unpublished.
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
          "settle-invoice-a-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("is a no-op when replayed against an already-paid invoice", async () => {
      const first = await service.reconcilePayment(
        "invoice-b-1",
        "GPAYER",
        "USDC",
        "GASDF",
        "200",
        "settle-invoice-b-1",
      );
      expect(first.status).toBe("paid");
      mockSorobanService.recordInvoicePayment.mockClear();

      const replayed = await service.reconcilePayment(
        "invoice-b-1",
        "GPAYER",
        "USDC",
        "GASDF",
        "200",
        "settle-invoice-b-1",
      );

      expect(replayed.status).toBe("paid");
      expect((replayed as any).amountPaid).toBe((first as any).amountPaid);
      expect(mockSorobanService.recordInvoicePayment).not.toHaveBeenCalled();
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
      const updated = await service.updateSorobanMetadata(
        "invoice-a-1",
        "soroban-tx",
        "contract-123",
      );
      expect(updated.statusHistory!.map((h) => h.status)).toContain("anchored");
    });

    it("appends a permanent-failure status history entry", async () => {
      await service.recordAnchoringFailure("invoice-a-1", "permanent");

      const detail = await service.findOne("invoice-a-1", MERCHANT_A);
      expect(detail.statusHistory!.map((h) => h.status)).toContain(
        "anchoring_failed_permanent",
      );
    });

    it("appends a transient-failure status history entry distinct from a permanent one", async () => {
      await service.recordAnchoringFailure("invoice-a-1", "transient");

      const detail = await service.findOne("invoice-a-1", MERCHANT_A);
      expect(detail.statusHistory!.map((h) => h.status)).toContain(
        "anchoring_failed_transient",
      );
      expect(detail.statusHistory!.map((h) => h.status)).not.toContain(
        "anchoring_failed_permanent",
      );
    });
  });
});
