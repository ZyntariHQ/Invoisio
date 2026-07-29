import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

describe("InvoicesService Cron", () => {
  let service: InvoicesService;

  const mockPrismaService = {
    invoice: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    invoiceStatusHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockWebhooksService = {
    enqueueWebhook: jest.fn(),
    enqueueReminderWebhook: jest.fn(),
  };

  const mockNotificationsService = {
    notifyInvoicePaid: jest.fn(),
    notifyInvoiceOverdue: jest.fn(),
    sendInvoiceReminderEmail: jest.fn(),
  };

  const mockStellarService = { getMerchantPublicKey: jest.fn() };
  const mockSorobanService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: StructuredLogger,
          useValue: mockStructuredLogger,
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("handleOverdueInvoices", () => {
    it("should mark overdue pending invoices as overdue", async () => {
      const now = new Date("2026-03-10T02:00:00Z");
      jest.useFakeTimers().setSystemTime(now);

      const overdueInvoices = [{ id: "inv-1" }, { id: "inv-2" }];
      mockPrismaService.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrismaService.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        status: "overdue",
        txHash: null,
        amount: 100,
      });

      await service.handleOverdueInvoices();

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith({
        where: {
          status: "pending",
          dueDate: { lt: now },
        },
        select: { id: true },
      });
      expect(mockPrismaService.invoice.updateMany).toHaveBeenCalledTimes(2);
      expect(mockWebhooksService.enqueueWebhook).toHaveBeenCalledTimes(2);
    });

    it("should handle empty list gracefully", async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      await service.handleOverdueInvoices();
      expect(mockPrismaService.invoice.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("sendScheduledReminders", () => {
    it("AC1: should query only unpaid invoices (pending, partially_paid, overdue; not draft/paid/cancelled)", async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      await service.sendScheduledReminders();

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ["pending", "partially_paid", "overdue"] },
          isDraft: false,
          dueDate: { not: null },
        },
        include: { user: true },
      });
    });

    it("AC2 & Scope: should send pre/post due reminders and prevent duplicate reminders for the same window", async () => {
      const now = new Date("2026-03-07T12:00:00Z");
      const dueDate = new Date("2026-03-10T12:00:00Z"); // 3 days after now

      const invoice = {
        id: "inv-unpaid-1",
        invoiceNumber: "INV-100",
        merchantId: "merch-1",
        clientEmail: "client@example.com",
        status: "pending",
        isDraft: false,
        dueDate,
        metadata: {},
      };

      mockPrismaService.invoice.findMany.mockResolvedValue([invoice]);
      mockPrismaService.invoice.update.mockResolvedValue({ ...invoice });

      // First run: should send reminder for "3_days_before"
      const result1 = await service.sendScheduledReminders({
        now,
        intervals: [{ daysRelative: -3, windowKey: "3_days_before" }],
        channel: "both",
      });

      expect(result1.remindersSentCount).toBe(1);
      expect(mockNotificationsService.sendInvoiceReminderEmail).toHaveBeenCalledWith(
        invoice,
        "3_days_before",
      );
      expect(mockWebhooksService.enqueueReminderWebhook).toHaveBeenCalledWith(
        "inv-unpaid-1",
        "3_days_before",
        "merch-1",
      );
      expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv-unpaid-1" },
        data: {
          metadata: {
            sentReminders: [
              expect.objectContaining({
                window: "3_days_before",
                channel: "both",
              }),
            ],
          },
        },
      });

      // Second run with updated metadata containing sentReminders: should SKIP duplicate
      const invoiceWithMetadata = {
        ...invoice,
        metadata: {
          sentReminders: [
            { window: "3_days_before", sentAt: now.toISOString(), channel: "both" },
          ],
        },
      };
      mockPrismaService.invoice.findMany.mockResolvedValue([invoiceWithMetadata]);
      jest.clearAllMocks();

      const result2 = await service.sendScheduledReminders({
        now,
        intervals: [{ daysRelative: -3, windowKey: "3_days_before" }],
      });

      expect(result2.remindersSentCount).toBe(0);
      expect(mockNotificationsService.sendInvoiceReminderEmail).not.toHaveBeenCalled();
      expect(mockWebhooksService.enqueueReminderWebhook).not.toHaveBeenCalled();
    });

    it("should respect configurable notification channels (email, webhook)", async () => {
      const now = new Date("2026-03-10T12:00:00Z");
      const invoice = {
        id: "inv-unpaid-2",
        invoiceNumber: "INV-101",
        merchantId: "merch-1",
        clientEmail: "client2@example.com",
        status: "pending",
        isDraft: false,
        dueDate: new Date("2026-03-10T12:00:00Z"),
        metadata: {},
      };

      mockPrismaService.invoice.findMany.mockResolvedValue([invoice]);
      mockPrismaService.invoice.update.mockResolvedValue({ ...invoice });

      // Channel: email
      await service.sendScheduledReminders({
        now,
        intervals: [{ daysRelative: 0, windowKey: "due_date" }],
        channel: "email",
      });

      expect(mockNotificationsService.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
      expect(mockWebhooksService.enqueueReminderWebhook).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Channel: webhook
      mockPrismaService.invoice.findMany.mockResolvedValue([invoice]);
      await service.sendScheduledReminders({
        now,
        intervals: [{ daysRelative: 0, windowKey: "due_date" }],
        channel: "webhook",
      });

      expect(mockNotificationsService.sendInvoiceReminderEmail).not.toHaveBeenCalled();
      expect(mockWebhooksService.enqueueReminderWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe("sendSingleInvoiceReminder", () => {
    it("AC1: should reject sending a reminder for a paid invoice", async () => {
      const paidInvoice = {
        id: "inv-paid",
        status: "paid",
        merchantId: "merch-1",
      };
      mockPrismaService.invoice.findFirst.mockResolvedValue(paidInvoice);

      await expect(
        service.sendSingleInvoiceReminder("inv-paid", "merch-1"),
      ).rejects.toThrow("Reminders can only be sent for unpaid invoices");
    });

    it("AC2: should avoid duplicate manual reminders if windowKey already exists in sentReminders", async () => {
      const invoice = {
        id: "inv-manual",
        status: "pending",
        merchantId: "merch-1",
        metadata: {
          sentReminders: [{ window: "manual", sentAt: "2026-03-01T00:00:00Z" }],
        },
      };
      mockPrismaService.invoice.findFirst.mockResolvedValue(invoice);

      const res = await service.sendSingleInvoiceReminder(
        "inv-manual",
        "merch-1",
        "both",
        "manual",
      );
      expect(res.sent).toBe(false);
      expect(mockNotificationsService.sendInvoiceReminderEmail).not.toHaveBeenCalled();
    });
  });
});
