import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { InvoiceEngagementService } from "./invoice-engagement.service";
import { PrismaService } from "../prisma/prisma.service";

const MERCHANT_A = "merchant-a";
const MERCHANT_B = "merchant-b";

describe("InvoiceEngagementService", () => {
  let service: InvoiceEngagementService;
  let createMock: jest.Mock;

  const invoices = [
    { id: "invoice-a-1", merchantId: MERCHANT_A },
    { id: "invoice-b-1", merchantId: MERCHANT_B },
  ];

  const mockPrisma = () => {
    createMock = jest
      .fn()
      .mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "event-1", createdAt: new Date(), ...data }),
      );

    return {
      invoice: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              invoices.find((inv) => inv.id === where.id) ?? null,
            ),
          ),
      },
      invoiceEngagementEvent: {
        create: createMock,
      },
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceEngagementService,
        { provide: PrismaService, useFactory: mockPrisma },
      ],
    }).compile();

    service = module.get<InvoiceEngagementService>(InvoiceEngagementService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  it("records a view event scoped to the invoice's merchant", async () => {
    await service.recordEvent("invoice-a-1", { type: "view" } as any);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        invoiceId: "invoice-a-1",
        merchantId: MERCHANT_A,
        type: "view",
        target: undefined,
      },
    });
  });

  it("records a wallet_launch action event with a target", async () => {
    await service.recordEvent("invoice-b-1", {
      type: "wallet_launch",
      target: "payment_uri",
    } as any);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        invoiceId: "invoice-b-1",
        merchantId: MERCHANT_B,
        type: "wallet_launch",
        target: "payment_uri",
      },
    });
  });

  it("records a copy action event with a target", async () => {
    await service.recordEvent("invoice-a-1", {
      type: "copy",
      target: "destination_address",
    } as any);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        invoiceId: "invoice-a-1",
        merchantId: MERCHANT_A,
        type: "copy",
        target: "destination_address",
      },
    });
  });

  it("throws NotFoundException for an unknown invoice", async () => {
    await expect(
      service.recordEvent("missing-invoice", { type: "view" } as any),
    ).rejects.toThrow(NotFoundException);
    expect(createMock).not.toHaveBeenCalled();
  });

  describe("merchant isolation", () => {
    it("always derives merchantId from the invoice, never trusting client input", async () => {
      await service.recordEvent("invoice-b-1", { type: "view" } as any);

      const [[{ data }]] = createMock.mock.calls;
      expect(data.merchantId).toBe(MERCHANT_B);
      expect(data.merchantId).not.toBe(MERCHANT_A);
    });
  });
});
