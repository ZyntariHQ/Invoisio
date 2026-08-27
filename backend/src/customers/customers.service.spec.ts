import { Test, TestingModule } from "@nestjs/testing";
import { CustomersService } from "./customers.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";

describe("CustomersService", () => {
  let service: CustomersService;
  let prisma: Record<string, any>;

  const mockMerchantId = "merchant-1";
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

      // Aggregate calls return different results based on status filter
      prisma.invoice.aggregate
        .mockResolvedValueOnce({
          _sum: { amount: { toNumber: () => 5000 } },
        }) // paid
        .mockResolvedValueOnce({
          _sum: { amountDue: { toNumber: () => 1200 } },
        }) // outstanding
        .mockResolvedValueOnce({
          _sum: { amountDue: { toNumber: () => 300 } },
        }); // overdue

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
