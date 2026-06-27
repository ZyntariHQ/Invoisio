import { Test, TestingModule } from "@nestjs/testing";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { EmailService } from "../notifications/email.service";

const now = new Date("2026-06-23T00:00:00Z");

describe("InvoiceRemindersService", () => {
  let service: InvoiceRemindersService;
  const mockPrismaService = {
    invoice: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const mockWebhooksService = {
    enqueueWebhook: jest.fn(),
  };
  const mockEmailService = {
    isEnabled: jest.fn().mockReturnValue(true),
    sendInvoiceReminder: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    mockEmailService.isEnabled.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRemindersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<InvoiceRemindersService>(InvoiceRemindersService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should send reminders for invoices in the configured window and update metadata", async () => {
    mockPrismaService.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        amount: 100,
        assetCode: "USDC",
        dueDate: new Date("2026-06-20T00:00:00Z"),
        merchantId: "merchant-1",
        metadata: {},
        clientEmail: "client@example.com",
        user: { webhookUrl: "https://example.com/webhook" },
      },
    ]);
    mockPrismaService.invoice.update.mockResolvedValue({});

    await service.handleInvoiceReminders();

    expect(mockEmailService.sendInvoiceReminder).toHaveBeenCalledTimes(1);
    expect(mockWebhooksService.enqueueWebhook).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        metadata: {
          reminderWindows: ["after_due_3d"],
        },
      },
    });
  });

  it("should not resend a duplicate reminder for the same window", async () => {
    mockPrismaService.invoice.findMany.mockResolvedValue([
      {
        id: "inv-2",
        invoiceNumber: "INV-002",
        amount: 200,
        assetCode: "USDC",
        dueDate: new Date("2026-06-20T00:00:00Z"),
        merchantId: "merchant-1",
        metadata: { reminderWindows: ["after_due_3d"] },
        clientEmail: "client@example.com",
        user: { webhookUrl: "https://example.com/webhook" },
      },
    ]);

    await service.handleInvoiceReminders();

    expect(mockEmailService.sendInvoiceReminder).not.toHaveBeenCalled();
    expect(mockWebhooksService.enqueueWebhook).not.toHaveBeenCalled();
    expect(mockPrismaService.invoice.update).not.toHaveBeenCalled();
  });

  it("should still mark reminder sent if webhook-only path succeeds", async () => {
    mockEmailService.isEnabled.mockReturnValue(false);
    mockPrismaService.invoice.findMany.mockResolvedValue([
      {
        id: "inv-3",
        invoiceNumber: "INV-003",
        amount: 200,
        assetCode: "USDC",
        dueDate: new Date("2026-06-20T00:00:00Z"),
        merchantId: "merchant-1",
        metadata: {},
        clientEmail: null,
        user: { webhookUrl: "https://example.com/webhook" },
      },
    ]);
    mockPrismaService.invoice.update.mockResolvedValue({});

    await service.handleInvoiceReminders();

    expect(mockWebhooksService.enqueueWebhook).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-3" },
      data: {
        metadata: {
          reminderWindows: ["after_due_3d"],
        },
      },
    });
  });

  it("should not update metadata if no reminder channel is configured", async () => {
    mockEmailService.isEnabled.mockReturnValue(false);
    mockPrismaService.invoice.findMany.mockResolvedValue([
      {
        id: "inv-4",
        invoiceNumber: "INV-004",
        amount: 150,
        assetCode: "USDC",
        dueDate: new Date("2026-06-20T00:00:00Z"),
        merchantId: "merchant-1",
        metadata: {},
        clientEmail: null,
        user: { webhookUrl: null },
      },
    ]);

    await service.handleInvoiceReminders();

    expect(mockPrismaService.invoice.update).not.toHaveBeenCalled();
  });

  it("should send before-due reminders for invoices due in the future", async () => {
    mockPrismaService.invoice.findMany.mockResolvedValue([
      {
        id: "inv-5",
        invoiceNumber: "INV-005",
        amount: 300,
        assetCode: "USDC",
        dueDate: new Date("2026-06-26T00:00:00Z"),
        merchantId: "merchant-1",
        metadata: {},
        clientEmail: "client@example.com",
        user: { webhookUrl: null },
      },
    ]);
    mockPrismaService.invoice.update.mockResolvedValue({});

    await service.handleInvoiceReminders();

    expect(mockEmailService.sendInvoiceReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inv-5" }),
      "Upcoming Invoice Due: INV-005",
      expect.stringContaining("due on 2026-06-26"),
    );
    expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-5" },
      data: {
        metadata: {
          reminderWindows: ["before_due_3d"],
        },
      },
    });
  });

});
