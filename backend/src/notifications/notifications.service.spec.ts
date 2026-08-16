import { Test, TestingModule } from "@nestjs/testing";
import { Expo } from "expo-server-sdk";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { Invoice, Payment, PaymentReview } from "@prisma/client";

jest.mock("expo-server-sdk", () => {
  const MockExpo: any = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: jest.fn((messages: unknown[]) => [messages]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
  }));
  MockExpo.isExpoPushToken = jest.fn().mockReturnValue(true);
  return { Expo: MockExpo };
});

const VALID_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let sendPushNotificationsAsync: jest.Mock;

  const mockPrisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "user-1",
          merchantId: "merchant-1",
          pushNotificationsEnabled: true,
          pushTokens: [VALID_TOKEN],
        },
      ]),
    },
  };

  beforeEach(async () => {
    (Expo.isExpoPushToken as unknown as jest.Mock).mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    const expoCtor = Expo as unknown as jest.Mock;
    const expoInstance = expoCtor.mock.results[expoCtor.mock.results.length - 1].value;
    sendPushNotificationsAsync = expoInstance.sendPushNotificationsAsync;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getSentPayload = () => {
    const messages = sendPushNotificationsAsync.mock.calls[0][0];
    return messages[0].data;
  };

  it("sends a deep-linkable payload for invoice.paid", async () => {
    const invoice = {
      id: "invoice-1",
      merchantId: "merchant-1",
      invoiceNumber: "INV-001",
      clientName: "Client A",
      amount: 100,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const payload = getSentPayload();
    expect(payload).toMatchObject({
      type: "invoice.paid",
      invoiceId: "invoice-1",
      invoiceNumber: "INV-001",
      deepLink: "invoisio://receipt/invoice-1",
    });
  });

  it("sends a deep-linkable payload for invoice.overdue", async () => {
    const invoice = {
      id: "invoice-2",
      merchantId: "merchant-1",
      invoiceNumber: "INV-002",
      clientName: "Client B",
    } as unknown as Invoice;

    await service.notifyInvoiceOverdue(invoice);

    const payload = getSentPayload();
    expect(payload).toMatchObject({
      type: "invoice.overdue",
      invoiceId: "invoice-2",
      invoiceNumber: "INV-002",
      deepLink: "invoisio://invoice/invoice-2",
    });
  });

  it("sends a deep-linkable payload for invoice.reminder", async () => {
    const invoice = {
      id: "invoice-3",
      merchantId: "merchant-1",
      invoiceNumber: "INV-003",
      clientName: "Client C",
    } as unknown as Invoice;

    await service.notifyInvoiceReminder(invoice);

    const payload = getSentPayload();
    expect(payload).toMatchObject({
      type: "invoice.reminder",
      invoiceId: "invoice-3",
      invoiceNumber: "INV-003",
      deepLink: "invoisio://invoice/invoice-3",
    });
  });

  it("sends a deep-linkable payload for payment.received", async () => {
    const payment = {
      id: "payment-1",
      invoiceId: "invoice-4",
      amount: 50,
    } as unknown as Payment;

    await service.notifyPaymentReceived(payment, "merchant-1");

    const payload = getSentPayload();
    expect(payload).toMatchObject({
      type: "payment.received",
      paymentId: "payment-1",
      invoiceId: "invoice-4",
      deepLink: "invoisio://receipt/invoice-4",
    });
  });

  it("sends a deep-linkable payload for payment.review_flagged", async () => {
    const review = {
      id: "review-1",
      merchantId: "merchant-1",
      invoiceId: "invoice-5",
      issueType: "underpaid",
    } as unknown as PaymentReview;

    await service.notifyPaymentReviewFlagged(review);

    const payload = getSentPayload();
    expect(payload).toMatchObject({
      type: "payment.review_flagged",
      reviewId: "review-1",
      invoiceId: "invoice-5",
      deepLink: "invoisio://review/review-1",
    });
  });

  it("skips sending when a PaymentReview has no merchantId", async () => {
    const review = {
      id: "review-2",
      merchantId: null,
      invoiceId: "invoice-6",
      issueType: "unmatched",
    } as unknown as PaymentReview;

    await service.notifyPaymentReviewFlagged(review);

    expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
  });
});
