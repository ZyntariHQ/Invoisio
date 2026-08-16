import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma, RecurringFrequency } from "@prisma/client";
import { RecurringBillingService } from "./recurring-billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { StellarService } from "../stellar/stellar.service";

/** Builds a P2002 unique-constraint error shaped like Prisma's real one. */
function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  const err = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  return Object.assign(err, { code: "P2002", message: "Unique constraint" });
}

describe("RecurringBillingService lifecycle", () => {
  let service: RecurringBillingService;

  const schedule = {
    id: "sched-1",
    merchantId: "merchant-1",
    customerId: "cust-1",
    createdByUserId: "user-1",
    amount: 100,
    assetCode: "XLM",
    assetIssuer: null,
    description: "Monthly retainer",
    frequency: RecurringFrequency.MONTHLY,
    status: "active",
    nextRunDate: new Date("2026-08-01T00:00:00Z"),
    lastGeneratedAt: null,
  };

  const mockTx = {
    recurringInvoiceRun: { create: jest.fn(), update: jest.fn() },
    invoice: { create: jest.fn() },
    recurringSchedule: { update: jest.fn() },
  };

  const mockPrisma = {
    customer: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    recurringSchedule: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  };

  const mockStellarService = {
    getMerchantPublicKey: jest.fn().mockReturnValue("GMERCHANT"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringBillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
      ],
    }).compile();

    service = module.get(RecurringBillingService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));
  });

  it("lets a merchant define a recurring rule for an existing customer", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockPrisma.recurringSchedule.create.mockResolvedValue(schedule);

    const result = await service.createSchedule("merchant-1", "user-1", {
      customerId: "cust-1",
      amount: 100,
      assetCode: "XLM",
      frequency: RecurringFrequency.MONTHLY,
    } as any);

    expect(mockPrisma.recurringSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantId: "merchant-1",
          createdByUserId: "user-1",
          customerId: "cust-1",
        }),
      }),
    );
    expect(result).toEqual(schedule);
  });

  it("rejects a schedule for a customer that isn't the merchant's", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.createSchedule("merchant-1", "user-1", {
        customerId: "cust-999",
        amount: 100,
        assetCode: "XLM",
        frequency: RecurringFrequency.MONTHLY,
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it("generates exactly one invoice for a due schedule and advances nextRunDate", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      name: "Acme Co",
      email: "acme@example.com",
    });
    mockTx.recurringInvoiceRun.create.mockResolvedValue({ id: "run-1" });
    mockTx.invoice.create.mockResolvedValue({ id: "inv-1" });

    await service.generateInvoiceForSchedule(schedule as any);

    expect(mockTx.recurringInvoiceRun.create).toHaveBeenCalledWith({
      data: { scheduleId: "sched-1", periodKey: "2026-08-01" },
    });
    expect(mockTx.invoice.create).toHaveBeenCalledTimes(1);
    expect(mockTx.recurringSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sched-1" },
        data: expect.objectContaining({
          nextRunDate: new Date("2026-08-31T00:00:00Z"),
        }),
      }),
    );
  });

  it("does not generate a duplicate invoice when the same period is retried", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      name: "Acme Co",
      email: "acme@example.com",
    });
    mockTx.recurringInvoiceRun.create.mockRejectedValue(
      uniqueConstraintError(),
    );

    await expect(
      service.generateInvoiceForSchedule(schedule as any),
    ).resolves.toBeUndefined();

    expect(mockTx.invoice.create).not.toHaveBeenCalled();
  });
});
