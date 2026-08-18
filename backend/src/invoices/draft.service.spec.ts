import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DraftService } from "./draft.service";
import { PrismaService } from "../prisma/prisma.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { ActivityFeedService } from "../activity-feed/activity-feed.service";
import { StellarService } from "../stellar/stellar.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

const MERCHANT_A = "merchant-a";
const MERCHANT_B = "merchant-b";
const USER_A = "user-a";

describe("DraftService — placeholder validation on conversion", () => {
  let service: DraftService;

  const mockStellarService = {
    getMerchantPublicKey: jest
      .fn()
      .mockReturnValue(
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ),
  };

  const mockActivityFeed = {
    recordEvent: jest.fn(),
  };

  /**
   * Build a mock PrismaService with a controllable invoice store.
   */
  const buildMockPrisma = () => {
    const invoices: any[] = [];

    return {
      _store: invoices,
      invoice: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const created = {
            id: `draft-${Math.random().toString(36).slice(2, 8)}`,
            ...data,
            amount: { toNumber: () => Number(data.amount) },
            amountPaid: { toNumber: () => 0 },
            amountDue: {
              toNumber: () => Number(data.amountDue ?? data.amount),
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            statusHistory: [
              { id: "h1", status: data.status, createdAt: new Date() },
            ],
          };
          invoices.push(created);
          return Promise.resolve(created);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          const found = invoices.find((inv) => {
            if (where.id && inv.id !== where.id) return false;
            if (where.merchantId && inv.merchantId !== where.merchantId)
              return false;
            if (where.isDraft !== undefined && inv.isDraft !== where.isDraft)
              return false;
            return true;
          });
          return Promise.resolve(found ?? null);
        }),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          const results = invoices.filter((inv) => {
            if (where.merchantId && inv.merchantId !== where.merchantId)
              return false;
            if (where.isDraft !== undefined && inv.isDraft !== where.isDraft)
              return false;
            return true;
          });
          return Promise.resolve(results);
        }),
        count: jest.fn().mockImplementation(({ where }: any) => {
          const count = invoices.filter((inv) => {
            if (where.merchantId && inv.merchantId !== where.merchantId)
              return false;
            if (where.isDraft !== undefined && inv.isDraft !== where.isDraft)
              return false;
            return true;
          }).length;
          return Promise.resolve(count);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const idx = invoices.findIndex((inv) => inv.id === where.id);
          if (idx === -1) return Promise.reject(new Error("not found"));
          const { statusHistory: shData, ...rest } = data;
          Object.assign(invoices[idx], rest, { updatedAt: new Date() });
          if (shData?.create) {
            if (!Array.isArray(invoices[idx].statusHistory)) {
              invoices[idx].statusHistory = [];
            }
            (invoices[idx].statusHistory as any[]).push({
              id: `h-${Math.random()}`,
              status: shData.create.status,
              createdAt: new Date(),
            });
          }
          // Ensure Decimal-like amounts after update
          const inv = invoices[idx];
          const toDec = (v: any) =>
            v && typeof v === "object" && typeof v.toNumber === "function"
              ? v
              : { toNumber: () => Number(v ?? 0) };
          inv.amount = toDec(inv.amount);
          inv.amountPaid = toDec(inv.amountPaid);
          inv.amountDue = toDec(inv.amountDue);
          return Promise.resolve(inv);
        }),
        delete: jest.fn().mockImplementation(({ where }: any) => {
          const idx = invoices.findIndex((inv) => inv.id === where.id);
          if (idx === -1) return Promise.reject(new Error("not found"));
          const removed = invoices.splice(idx, 1)[0];
          return Promise.resolve(removed);
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  };

  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
        { provide: StructuredLogger, useValue: mockStructuredLogger },
        { provide: ActivityFeedService, useValue: mockActivityFeed },
      ],
    }).compile();

    service = module.get<DraftService>(DraftService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  // ─── Helper: seed a draft directly into the store ───
  const seedDraft = (overrides: Record<string, any> = {}) => {
    const draft = {
      id: `draft-seed-${Math.random().toString(36).slice(2, 8)}`,
      merchantId: MERCHANT_A,
      userId: USER_A,
      invoiceNumber: "DRAFT-000001",
      clientName: "Placeholder",
      clientEmail: "test@example.com",
      description: null,
      amount: 100,
      amountPaid: 0,
      amountDue: 100,
      assetCode: "XLM",
      assetIssuer: null,
      memo: "99999",
      memoType: "ID",
      status: "draft",
      isDraft: true,
      draftVersion: 1,
      destinationAddress: "GBX...",
      txHash: null,
      sorobanTxHash: null,
      sorobanContractId: null,
      metadata: null,
      dueDate: null,
      draftData: null,
      customerId: null,
      lastAutoSavedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      statusHistory: [],
      ...overrides,
    };
    mockPrisma._store.push(draft);
    return draft;
  };

  // ─────────────────────────────────────────────────────────
  //  CONVERSION: placeholder rejection
  // ─────────────────────────────────────────────────────────
  describe("convertDraftToInvoice — placeholder rejection", () => {
    it("converts a draft with valid client data", async () => {
      const draft = seedDraft({
        clientName: "Acme Corporation",
        clientEmail: "billing@acme.com",
        amount: 1500,
        assetCode: "XLM",
      });

      const result = await service.convertDraftToInvoice(
        draft.id,
        MERCHANT_A,
        USER_A,
      );

      expect(result.status).toBe("pending");
      expect(result.clientName).toBe("Acme Corporation");
      expect(result.clientEmail).toBe("billing@acme.com");
    });

    it("rejects conversion with placeholder name 'Untitled Client'", async () => {
      const draft = seedDraft({
        clientName: "Untitled Client",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder name 'Customer'", async () => {
      const draft = seedDraft({
        clientName: "Customer",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder name 'Lambda Cargo'", async () => {
      const draft = seedDraft({
        clientName: "Lambda Cargo",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder name 'Vendor or client'", async () => {
      const draft = seedDraft({
        clientName: "Vendor or client",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder name 'Test'", async () => {
      const draft = seedDraft({
        clientName: "Test",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder name 'N/A'", async () => {
      const draft = seedDraft({
        clientName: "N/A",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with empty clientName", async () => {
      const draft = seedDraft({
        clientName: "",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with single-character clientName", async () => {
      const draft = seedDraft({
        clientName: "X",
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder email 'test@example.com'", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "test@example.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with placeholder email 'client@example.com'", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "client@example.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with empty email", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with email missing @", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "notanemail",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects conversion with zero amount", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "billing@acme.com",
        amount: 0,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    it("collects multiple errors in a single message", async () => {
      const draft = seedDraft({
        clientName: "Customer",
        clientEmail: "test@example.com",
        amount: 0,
        assetCode: "XLM",
      });

      try {
        await service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A);
        fail("Expected BadRequestException");
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const msg = (err as BadRequestException).message;
        expect(msg).toContain("Client name");
        expect(msg).toContain("Client email");
        expect(msg).toContain("Amount");
      }
    });

    it("throws NotFoundException for another merchant's draft", async () => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: "billing@acme.com",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_B, USER_A),
      ).rejects.toThrow(NotFoundException);
    });

    it("marks draft as no longer a draft after conversion", async () => {
      const draft = seedDraft({
        clientName: "Acme Corporation",
        clientEmail: "billing@acme.com",
        amount: 500,
        assetCode: "XLM",
      });

      await service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A);

      const updated = mockPrisma._store.find((i) => i.id === draft.id);
      expect(updated.isDraft).toBe(false);
      expect(updated.status).toBe("pending");
    });
  });

  // ─────────────────────────────────────────────────────────
  //  Placeholder detection helpers (via private access for unit-level checks)
  // ─────────────────────────────────────────────────────────
  describe("placeholder detection (via conversion)", () => {
    const names = [
      "Client",
      "client",
      "Customer",
      "Untitled Client",
      "Vendor or client",
      "Vendor",
      "Counterparty",
      "Test",
      "test client",
      "placeholder",
      "N/A",
      "na",
      "none",
      "TODO",
      "TBD",
      "Lambda Cargo",
      "Your Client",
      "Company Name",
      "Client Name",
      "Enter Name",
      "Name",
    ];

    it.each(names)("rejects placeholder name '%s'", async (name) => {
      const draft = seedDraft({
        clientName: name,
        clientEmail: "real@company.com",
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    const emails = [
      "test@example.com",
      "foo@example.com",
      "a@test.com",
      "x@placeholder.com",
      "info@noreply.com",
      "client@example.com",
    ];

    it.each(emails)("rejects placeholder email '%s'", async (email) => {
      const draft = seedDraft({
        clientName: "Acme Corp",
        clientEmail: email,
        amount: 100,
        assetCode: "XLM",
      });

      await expect(
        service.convertDraftToInvoice(draft.id, MERCHANT_A, USER_A),
      ).rejects.toThrow(BadRequestException);
    });

    const validNames = [
      "Acme Corporation",
      "TechStart Inc",
      "Global Solutions Ltd",
      "Joanna Smith",
      "Beta LLC",
    ];

    it.each(validNames)("accepts valid client name '%s'", async (name) => {
      const draft = seedDraft({
        clientName: name,
        clientEmail: "billing@realcompany.com",
        amount: 100,
        assetCode: "XLM",
      });

      const result = await service.convertDraftToInvoice(
        draft.id,
        MERCHANT_A,
        USER_A,
      );
      expect(result.clientName).toBe(name);
    });
  });
});
