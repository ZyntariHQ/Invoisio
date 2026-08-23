import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CustomersService", () => {
  let service: CustomersService;
  let prisma: Record<string, any>;

  const mockMerchantId = "merchant-1";
  const otherMerchantId = "merchant-2";
  const mockCustomerId = "customer-1";

  beforeEach(async () => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      invoice: {
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("creates a customer scoped to the merchant, trimming and lowercasing the email", async () => {
      prisma.customer.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "new-id", ...data }),
      );

      const created = await service.create(mockMerchantId, {
        name: "  New Co  ",
        email: "  Hi@NewCo.com  ",
      });

      expect(created.merchantId).toBe(mockMerchantId);
      expect(created.name).toBe("New Co");
      expect(created.email).toBe("hi@newco.com");
    });

    it("stores a null email and null notes when neither is provided", async () => {
      prisma.customer.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "new-id", ...data }),
      );

      const created = await service.create(mockMerchantId, {
        name: "No Email Co",
      });

      expect(created.email).toBeNull();
      expect(created.notes).toBeNull();
    });

    it("throws ConflictException when the (merchantId, email) unique constraint is violated", async () => {
      prisma.customer.create.mockRejectedValue({
        code: "P2002",
        constructor: { name: "PrismaClientKnownRequestError" },
      });
      // Prisma.PrismaClientKnownRequestError is a real class; simulate via
      // Object.setPrototypeOf so `instanceof` in the service resolves true.
      const { Prisma } = jest.requireActual("@prisma/client");
      const conflictError = Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      );
      conflictError.code = "P2002";
      prisma.customer.create.mockRejectedValue(conflictError);

      await expect(
        service.create(mockMerchantId, {
          name: "Dup Co",
          email: "dup@co.com",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rethrows unrelated errors", async () => {
      prisma.customer.create.mockRejectedValue(new Error("db is down"));

      await expect(
        service.create(mockMerchantId, { name: "Whatever" }),
      ).rejects.toThrow("db is down");
    });
  });

  describe("findAll", () => {
    it("scopes the query to the merchant with no search term", async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(mockMerchantId);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { merchantId: mockMerchantId },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
    });

    it("adds a name/email OR filter when a search term is given", async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(mockMerchantId, "acme", 10);

      const call = prisma.customer.findMany.mock.calls[0][0];
      expect(call.where.merchantId).toBe(mockMerchantId);
      expect(call.where.OR).toEqual([
        { name: { contains: "acme", mode: "insensitive" } },
        { email: { contains: "acme", mode: "insensitive" } },
      ]);
      expect(call.take).toBe(10);
    });
  });

  describe("findOne", () => {
    it("returns the customer when found within the merchant", async () => {
      const customer = { id: mockCustomerId, merchantId: mockMerchantId };
      prisma.customer.findFirst.mockResolvedValue(customer);

      const result = await service.findOne(mockMerchantId, mockCustomerId);

      expect(result).toBe(customer);
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: mockCustomerId, merchantId: mockMerchantId },
      });
    });

    it("throws NotFoundException when the customer does not belong to the merchant", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(otherMerchantId, mockCustomerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("updates only the provided fields, trimming name/email/notes", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
      });
      prisma.customer.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: mockCustomerId, ...data }),
      );

      const result = await service.update(mockMerchantId, mockCustomerId, {
        name: "  Renamed  ",
      });

      expect(result.name).toBe("Renamed");
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: { name: "Renamed" },
      });
    });

    it("throws NotFoundException before attempting to update a customer outside the merchant", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.update(otherMerchantId, mockCustomerId, { name: "X" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("throws ConflictException on a duplicate email", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
      });
      const { Prisma } = jest.requireActual("@prisma/client");
      const conflictError = Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      );
      conflictError.code = "P2002";
      prisma.customer.update.mockRejectedValue(conflictError);

      await expect(
        service.update(mockMerchantId, mockCustomerId, {
          email: "taken@co.com",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("remove", () => {
    it("deletes the customer after confirming merchant ownership", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
      });
      prisma.customer.delete.mockResolvedValue({ id: mockCustomerId });

      const result = await service.remove(mockMerchantId, mockCustomerId);

      expect(result).toEqual({ id: mockCustomerId, deleted: true });
      expect(prisma.customer.delete).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
      });
    });

    it("throws NotFoundException instead of deleting a customer outside the merchant", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(otherMerchantId, mockCustomerId),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customer.delete).not.toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("returns the merchant's most recently touched customers with an empty query", async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.search(mockMerchantId, "");

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { merchantId: mockMerchantId },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
    });

    it("filters by name or email, scoped to the merchant", async () => {
      prisma.customer.findMany.mockResolvedValue([]);

      await service.search(mockMerchantId, "beta", 5);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: mockMerchantId,
          OR: [
            { name: { contains: "beta", mode: "insensitive" } },
            { email: { contains: "beta", mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      });
    });

    describe("merchant isolation", () => {
      it("always scopes the where clause to the requesting merchant, never a caller-supplied one", async () => {
        prisma.customer.findMany.mockResolvedValue([]);

        await service.search(otherMerchantId, "acme");

        const call = prisma.customer.findMany.mock.calls[0][0];
        expect(call.where.merchantId).toBe(otherMerchantId);
      });
    });
  });

  describe("getCustomerSummary", () => {
    it("should return summary with zero values for customer with no invoices", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
        name: "Test Customer",
        email: "test@example.com",
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { amount: null, amountDue: null },
      });
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.getCustomerSummary(
        mockMerchantId,
        mockCustomerId,
      );

      expect(result).toEqual({
        id: mockCustomerId,
        name: "Test Customer",
        email: "test@example.com",
        invoiceCount: 0,
        paidVolume: 0,
        outstandingBalance: 0,
        overdueBalance: 0,
        recentInvoices: [],
      });
    });

    it("should throw NotFoundException for non-existent customer", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.getCustomerSummary(mockMerchantId, "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should aggregate invoice metrics correctly", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
        name: "Acme Corp",
        email: "acme@example.com",
      });

      prisma.invoice.count.mockResolvedValue(10);

      prisma.invoice.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: { toNumber: () => 5000 } },
        })
        .mockResolvedValueOnce({
          _sum: { amountDue: { toNumber: () => 1200 } },
        })
        .mockResolvedValueOnce({
          _sum: { amountDue: { toNumber: () => 300 } },
        });

      prisma.invoice.findMany.mockResolvedValue([
        {
          id: "inv-1",
          invoiceNumber: "INV-001",
          amount: { toNumber: () => 1000 },
          status: "paid",
          createdAt: new Date("2026-08-01"),
        },
        {
          id: "inv-2",
          invoiceNumber: "INV-002",
          amount: { toNumber: () => 500 },
          status: "pending",
          createdAt: new Date("2026-07-15"),
        },
      ]);

      const result = await service.getCustomerSummary(
        mockMerchantId,
        mockCustomerId,
      );

      expect(result.invoiceCount).toBe(10);
      expect(result.paidVolume).toBe(5000);
      expect(result.outstandingBalance).toBe(1200);
      expect(result.overdueBalance).toBe(300);
      expect(result.recentInvoices).toHaveLength(2);
      expect(result.recentInvoices[0].id).toBe("inv-1");
      expect(result.recentInvoices[0].amount).toBe(1000);
    });

    it("should scope queries to the correct merchant and customer", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
        name: "Scoped Customer",
        email: null,
      });

      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { amount: null, amountDue: null },
      });
      prisma.invoice.findMany.mockResolvedValue([]);

      await service.getCustomerSummary(mockMerchantId, mockCustomerId);

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: mockCustomerId, merchantId: mockMerchantId },
      });

      const countCall = prisma.invoice.count.mock.calls[0][0];
      expect(countCall.where.merchantId).toBe(mockMerchantId);
      expect(countCall.where.customerId).toBe(mockCustomerId);
      expect(countCall.where.isDraft).toBe(false);
    });

    it("should return null email for customer without email", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
        name: "No Email Customer",
        email: null,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { amount: null, amountDue: null },
      });
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.getCustomerSummary(
        mockMerchantId,
        mockCustomerId,
      );

      expect(result.email).toBeNull();
    });

    it("should limit recent invoices to 5", async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: mockCustomerId,
        merchantId: mockMerchantId,
        name: "Active Customer",
        email: "active@example.com",
      });
      prisma.invoice.count.mockResolvedValue(20);
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { amount: null, amountDue: null },
      });

      const mockInvoices = Array.from({ length: 5 }, (_, i) => ({
        id: `inv-${i}`,
        invoiceNumber: `INV-${String(i).padStart(3, "0")}`,
        amount: { toNumber: () => (i + 1) * 100 },
        status: "paid",
        createdAt: new Date(`2026-08-${10 - i}`),
      }));
      prisma.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await service.getCustomerSummary(
        mockMerchantId,
        mockCustomerId,
      );

      expect(result.recentInvoices).toHaveLength(5);

      const findManyCall = prisma.invoice.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(5);
    });
  });
});
