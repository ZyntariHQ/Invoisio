import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";

const MERCHANT_A = "merchant-a";
const USER_A = "user-a";

const HEADER =
  "invoiceNumber,clientName,clientEmail,description,amount,asset_code,asset_issuer";

describe("InvoicesService - importFromCsv", () => {
  let service: InvoicesService;
  let createMock: jest.Mock;

  const mockStellarService = {
    getMerchantPublicKey: jest
      .fn()
      .mockReturnValue(
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ),
  };

  const mockSorobanService = {
    hasInvoicePayment: jest.fn().mockResolvedValue(false),
    recordInvoicePayment: jest.fn(),
    getInvoicePayment: jest.fn().mockResolvedValue(null),
  };

  const mockWebhooksService = {
    enqueueWebhook: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    createMock = jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: `inv-${Math.random().toString(36).slice(2)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const mockPrisma = {
      invoice: {
        create: createMock,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhooksService, useValue: mockWebhooksService },
        {
          provide: NotificationsService,
          useValue: {
            notifyInvoicePaid: jest.fn(),
            notifyInvoiceOverdue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it("creates all rows when every row is valid", async () => {
    const csv = [
      HEADER,
      "INV-001,Acme Corp,a@example.com,Widget order,100,XLM,",
      "INV-002,Beta LLC,b@example.com,Gadget order,200,XLM,",
      "INV-003,Gamma Inc,c@example.com,Service fee,300,XLM,",
    ].join("\n");

    const result = await service.importFromCsv(
      Buffer.from(csv),
      USER_A,
      MERCHANT_A,
    );

    expect(result.totalRows).toBe(3);
    expect(result.createdCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.created.map((c) => c.invoiceNumber)).toEqual([
      "INV-001",
      "INV-002",
      "INV-003",
    ]);
  });

  it("reports invalid rows as skipped without dropping valid rows", async () => {
    const csv = [
      HEADER,
      "INV-001,Acme Corp,a@example.com,Widget order,100,XLM,",
      "INV-002,Beta LLC,not-an-email,Gadget order,200,XLM,",
      "INV-003,Gamma Inc,c@example.com,Service fee,300,XLM,",
    ].join("\n");

    const result = await service.importFromCsv(
      Buffer.from(csv),
      USER_A,
      MERCHANT_A,
    );

    expect(result.totalRows).toBe(3);
    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.skipped[0]).toMatchObject({ row: 3, field: "clientEmail" });
  });

  it("skips every row when all are invalid and never hits the DB", async () => {
    const csv = [
      HEADER,
      "INV-001,Acme Corp,a@example.com,Widget order,not-a-number,XLM,",
      "INV-002,Beta LLC,b@example.com,Gadget order,abc,XLM,",
    ].join("\n");

    const result = await service.importFromCsv(
      Buffer.from(csv),
      USER_A,
      MERCHANT_A,
    );

    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBeGreaterThan(0);
    expect(new Set(result.skipped.map((s) => s.row))).toEqual(new Set([2, 3]));
    expect(createMock).not.toHaveBeenCalled();
  });

  it("treats an in-file duplicate invoiceNumber as skipped, not failed", async () => {
    const csv = [
      HEADER,
      "INV-001,Acme Corp,a@example.com,Widget order,100,XLM,",
      "INV-001,Beta LLC,b@example.com,Gadget order,200,XLM,",
    ].join("\n");

    const result = await service.importFromCsv(
      Buffer.from(csv),
      USER_A,
      MERCHANT_A,
    );

    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.skipped[0].message).toMatch(/duplicate/i);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("reports a DB write failure as failed, not skipped, while other rows still succeed", async () => {
    createMock
      .mockImplementationOnce(({ data }: any) =>
        Promise.resolve({ id: "inv-1", ...data }),
      )
      .mockImplementationOnce(() =>
        Promise.reject(
          Object.assign(new Error("unique constraint"), { code: "P2002" }),
        ),
      )
      .mockImplementationOnce(({ data }: any) =>
        Promise.resolve({ id: "inv-3", ...data }),
      );

    const csv = [
      HEADER,
      "INV-001,Acme Corp,a@example.com,Widget order,100,XLM,",
      "INV-002,Beta LLC,b@example.com,Gadget order,200,XLM,",
      "INV-003,Gamma Inc,c@example.com,Service fee,300,XLM,",
    ].join("\n");

    const result = await service.importFromCsv(
      Buffer.from(csv),
      USER_A,
      MERCHANT_A,
    );

    expect(result.createdCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.failed[0].row).toBe(3);
  });

  it("rejects an empty file", async () => {
    await expect(
      service.importFromCsv(Buffer.from(""), USER_A, MERCHANT_A),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns an empty summary for a header-only file", async () => {
    const result = await service.importFromCsv(
      Buffer.from(HEADER),
      USER_A,
      MERCHANT_A,
    );

    expect(result.totalRows).toBe(0);
    expect(result.createdCount).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a CSV with a missing required header", async () => {
    const csv = [
      "invoiceNum,clientName,clientEmail,amount,asset_code",
      "INV-001,Acme Corp,a@example.com,100,XLM",
    ].join("\n");

    await expect(
      service.importFromCsv(Buffer.from(csv), USER_A, MERCHANT_A),
    ).rejects.toThrow(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a CSV exceeding the maximum row count", async () => {
    const rows = Array.from(
      { length: 501 },
      (_, i) => `INV-${i},Client ${i},client${i}@example.com,desc,100,XLM,`,
    );
    const csv = [HEADER, ...rows].join("\n");

    await expect(
      service.importFromCsv(Buffer.from(csv), USER_A, MERCHANT_A),
    ).rejects.toThrow(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });
});
