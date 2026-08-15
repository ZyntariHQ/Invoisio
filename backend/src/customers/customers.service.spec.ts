import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers to build minimal customer / invoice fixtures
// ---------------------------------------------------------------------------

function makeCustomer(overrides: Partial<ReturnType<typeof baseCustomer>> = {}) {
  return { ...baseCustomer(), ...overrides };
}

function baseCustomer() {
  return {
    id: "cust-1",
    merchantId: "merch-1",
    name: "Acme Corp",
    email: "billing@acme.test",
    notes: null as string | null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };
}

// ---------------------------------------------------------------------------
// Build a mock PrismaService
// ---------------------------------------------------------------------------

function makePrismaMock() {
  const mock = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    customerMergeLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    runWithMerchantScope: jest.fn(),
  };

  // By default $transaction just calls the callback with the mock as the tx
  mock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(mock),
  );

  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomersService", () => {
  const MERCHANT_ID = "merch-1";

  let service: CustomersService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    service = new CustomersService(prisma as unknown as PrismaService);
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates a customer with trimmed, lower-cased email", async () => {
      const created = makeCustomer({ email: "billing@acme.test" });
      prisma.customer.create.mockResolvedValue(created);

      const result = await service.create(MERCHANT_ID, {
        name: "  Acme Corp  ",
        email: "  Billing@Acme.TEST  ",
      });

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          merchantId: MERCHANT_ID,
          name: "Acme Corp",
          email: "billing@acme.test",
          notes: null,
        },
      });
      expect(result).toEqual(created);
    });

    it("throws ConflictException on duplicate email (P2002)", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "0",
      });
      prisma.customer.create.mockRejectedValue(err);

      await expect(
        service.create(MERCHANT_ID, { name: "Dup", email: "dup@test.com" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // =========================================================================
  // findOne
  // =========================================================================

  describe("findOne", () => {
    it("returns the customer when found", async () => {
      const cust = makeCustomer();
      prisma.customer.findFirst.mockResolvedValue(cust);
      await expect(service.findOne(MERCHANT_ID, "cust-1")).resolves.toEqual(
        cust,
      );
    });

    it("throws NotFoundException when customer does not exist", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.findOne(MERCHANT_ID, "missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // =========================================================================
  // Duplicate detection
  // =========================================================================

  describe("findDuplicates", () => {
    const target = makeCustomer({ id: "cust-target", name: "Acme Corp", email: "billing@acme.test" });

    beforeEach(() => {
      // findOne is called first to verify the target exists
      prisma.customer.findFirst.mockResolvedValue(target);
      // Default: no invoice emails for the target
      prisma.invoice.findMany.mockResolvedValue([]);
    });

    it("returns an empty matches array when no other customers exist", async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.customerId).toBe(target.id);
      expect(result.matches).toHaveLength(0);
    });

    it("scores +0.6 for an exact email match", async () => {
      const peer = {
        ...makeCustomer({ id: "cust-peer", name: "Totally Different Name", email: "billing@acme.test" }),
        _count: { invoices: 0 },
      };
      prisma.customer.findMany.mockResolvedValue([peer]);

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].score).toBeCloseTo(0.6);
      expect(result.matches[0].reasons).toContain("Identical email address");
    });

    it("scores +0.3 for highly similar names (≥0.8 token-set Jaccard)", async () => {
      const peer = {
        ...makeCustomer({ id: "cust-peer", name: "Acme Corp Ltd", email: null }),
        _count: { invoices: 0 },
      };
      prisma.customer.findMany.mockResolvedValue([peer]);

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches).toHaveLength(1);
      // "acme corp" vs "acme corp" after stripping Ltd → similarity = 1.0 → +0.3
      expect(result.matches[0].score).toBeGreaterThanOrEqual(0.3);
      expect(
        result.matches[0].reasons.some((r) => r.includes("similar name") || r.includes("Similar name")),
      ).toBe(true);
    });

    it("scores +0.1 for invoice history hint (peer invoice email matches target email)", async () => {
      const peer = {
        ...makeCustomer({ id: "cust-peer", name: "Completely Different", email: null }),
        _count: { invoices: 1 },
      };
      prisma.customer.findMany.mockResolvedValue([peer]);

      // First call: target invoices (no match), second call: peer invoices have target's email
      prisma.invoice.findMany
        .mockResolvedValueOnce([]) // target invoices
        .mockResolvedValueOnce([{ clientEmail: "billing@acme.test" }]); // peer invoices

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].score).toBeCloseTo(0.1);
      expect(result.matches[0].reasons).toContain(
        "Shared email found in invoice history",
      );
    });

    it("accumulates scores and orders matches by descending score", async () => {
      const highScore = {
        ...makeCustomer({ id: "cust-high", name: "Acme Corp", email: "billing@acme.test" }),
        _count: { invoices: 2 },
      };
      const lowScore = {
        ...makeCustomer({ id: "cust-low", name: "Acme Corp", email: null }),
        _count: { invoices: 0 },
      };
      prisma.customer.findMany.mockResolvedValue([lowScore, highScore]);

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches[0].candidate.id).toBe("cust-high");
      expect(result.matches[0].score).toBeGreaterThan(result.matches[1].score);
    });

    it("does not include customers with score 0 in the result", async () => {
      const unrelated = {
        ...makeCustomer({ id: "cust-unrelated", name: "Smith Plumbing", email: "hello@smith.test" }),
        _count: { invoices: 0 },
      };
      prisma.customer.findMany.mockResolvedValue([unrelated]);

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches).toHaveLength(0);
    });

    it("caps score at 1.0", async () => {
      // email match (0.6) + name match (0.3) + invoice hint (0.1) = 1.0
      const peer = {
        ...makeCustomer({ id: "cust-peer", name: "Acme Corp", email: "billing@acme.test" }),
        _count: { invoices: 3 },
      };
      prisma.customer.findMany.mockResolvedValue([peer]);
      prisma.invoice.findMany
        .mockResolvedValueOnce([]) // target invoices
        .mockResolvedValueOnce([{ clientEmail: "billing@acme.test" }]); // peer invoices

      const result = await service.findDuplicates(MERCHANT_ID, target.id);

      expect(result.matches[0].score).toBeLessThanOrEqual(1.0);
    });
  });

  // =========================================================================
  // merge
  // =========================================================================

  describe("merge", () => {
    const winner = makeCustomer({ id: "cust-winner", name: "Acme Corp", notes: "VIP client" });
    const loser = makeCustomer({ id: "cust-loser", name: "Acme Corp.", notes: "Duplicate entry" });
    const mergeLog = {
      id: "log-1",
      merchantId: MERCHANT_ID,
      winnerId: "cust-winner",
      loserId: "cust-loser",
      invoicesRelinked: 3,
      mergedAt: new Date(),
    };
    const updatedWinner = { ...winner, notes: "VIP client\n---\nDuplicate entry", _count: { invoices: 5 } };

    beforeEach(() => {
      // findFirst calls for both winner and loser
      prisma.customer.findFirst
        .mockResolvedValueOnce(winner)
        .mockResolvedValueOnce(loser);

      // Inside the transaction
      prisma.invoice.updateMany.mockResolvedValue({ count: 3 });
      prisma.customer.update.mockResolvedValue(updatedWinner);
      prisma.customerMergeLog.create.mockResolvedValue(mergeLog);
      prisma.customer.delete.mockResolvedValue(loser);
    });

    it("re-points invoices from loser to winner", async () => {
      await service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {});

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { customerId: "cust-loser", merchantId: MERCHANT_ID },
        data: { customerId: "cust-winner" },
      });
    });

    it("merges notes when both winner and loser have notes", async () => {
      await service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {});

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: "VIP client\n---\nDuplicate entry",
          }),
        }),
      );
    });

    it("keeps winner notes unchanged when loser has no notes", async () => {
      const loserNoNotes = { ...loser, notes: null };
      prisma.customer.findFirst
        .mockReset()
        .mockResolvedValueOnce(winner)
        .mockResolvedValueOnce(loserNoNotes);

      await service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {});

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: "VIP client" }),
        }),
      );
    });

    it("writes a CustomerMergeLog with correct metadata", async () => {
      const dto = { mergeNote: "Merged at customer request" };
      await service.merge(MERCHANT_ID, "cust-winner", "cust-loser", dto, "GPUBLICKEY");

      expect(prisma.customerMergeLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merchantId: MERCHANT_ID,
          winnerId: "cust-winner",
          loserId: "cust-loser",
          invoicesRelinked: 3,
          mergedBy: "GPUBLICKEY",
          mergeNote: "Merged at customer request",
          loserSnapshot: expect.objectContaining({ id: "cust-loser" }),
        }),
      });
    });

    it("deletes the loser after relinking invoices", async () => {
      await service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {});

      expect(prisma.customer.delete).toHaveBeenCalledWith({
        where: { id: "cust-loser" },
      });
    });

    it("returns the updated winner and the merge log", async () => {
      const result = await service.merge(
        MERCHANT_ID,
        "cust-winner",
        "cust-loser",
        {},
      );

      expect(result.winner).toEqual(updatedWinner);
      expect(result.mergeLog).toEqual(mergeLog);
    });

    it("throws BadRequestException for a self-merge attempt", async () => {
      prisma.customer.findFirst.mockReset();

      await expect(
        service.merge(MERCHANT_ID, "cust-1", "cust-1", {}),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when winner does not exist", async () => {
      prisma.customer.findFirst.mockReset().mockResolvedValue(null);

      await expect(
        service.merge(MERCHANT_ID, "missing-winner", "cust-loser", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException when loser does not exist", async () => {
      prisma.customer.findFirst
        .mockReset()
        .mockResolvedValueOnce(winner)   // winner found
        .mockResolvedValueOnce(null);    // loser not found

      await expect(
        service.merge(MERCHANT_ID, "cust-winner", "missing-loser", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects cross-merchant merge when winner belongs to a different merchant", async () => {
      // The merchantId-scoped findFirst returns null because the winner belongs
      // to another merchant — the query WHERE merchantId = MERCHANT_ID finds nothing.
      prisma.customer.findFirst
        .mockReset()
        .mockResolvedValueOnce(null);   // winner not found for this merchant

      await expect(
        service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("rejects cross-merchant merge when loser belongs to a different merchant", async () => {
      prisma.customer.findFirst
        .mockReset()
        .mockResolvedValueOnce(winner)  // winner found for this merchant
        .mockResolvedValueOnce(null);   // loser not found for this merchant

      await expect(
        service.merge(MERCHANT_ID, "cust-winner", "cust-loser", {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // search & findAll
  // =========================================================================

  describe("search", () => {
    it("returns all customers when query is empty", async () => {
      const custs = [makeCustomer()];
      prisma.customer.findMany.mockResolvedValue(custs);

      const result = await service.search(MERCHANT_ID, "", 10);
      expect(result).toEqual(custs);
    });

    it("passes the search query to Prisma with insensitive mode", async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      await service.search(MERCHANT_ID, "acme", 5);

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: MERCHANT_ID,
            OR: expect.arrayContaining([
              { name: { contains: "acme", mode: "insensitive" } },
            ]),
          }),
          take: 5,
        }),
      );
    });
  });
});
