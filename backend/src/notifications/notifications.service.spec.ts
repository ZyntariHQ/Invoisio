import { Test, TestingModule } from "@nestjs/testing";
import { Expo } from "expo-server-sdk";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { Invoice, Payment, PaymentReview } from "@prisma/client";

jest.mock("expo-server-sdk", () => {
  const MockExpo: any = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: jest.fn((messages: unknown[]) =>
      messages.length === 0 ? [] : [messages],
    ),
    chunkPushNotificationReceiptIds: jest.fn((ids: unknown[]) =>
      ids.length === 0 ? [] : [ids],
    ),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
    getPushNotificationReceiptsAsync: jest.fn().mockResolvedValue({}),
  }));
  MockExpo.isExpoPushToken = jest.fn().mockReturnValue(true);
  return { Expo: MockExpo };
});

const VALID_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";
const BAD_TOKEN = "ExponentPushToken[bad-token-xxxxxxxxxxxxx]";
const TICKET_ID_OK = "xxxx-ticket-id-ok";
const TICKET_ID_PERMANENT_FAIL = "xxxx-ticket-id-perm";
const TICKET_ID_RETRYABLE_FAIL = "xxxx-ticket-id-retry";

type MockTx = any;

function makePrismaMock() {
  const pushNotificationsInDb: any[] = [];
  let nextId = 1;

  interface MockUser {
    id: string;
    merchantId: string;
    pushNotificationsEnabled: boolean;
    pushTokens: string[];
  }

  const usersInDb: Map<string, MockUser> = new Map();

  const user1: MockUser = {
    id: "user-1",
    merchantId: "merchant-1",
    pushNotificationsEnabled: true,
    pushTokens: [VALID_TOKEN, BAD_TOKEN],
  };
  usersInDb.set(user1.id, user1);

  function cloneUser(u: MockUser): MockUser {
    return { ...u, pushTokens: [...u.pushTokens] };
  }

  const mockTx: MockTx = {
    pushNotification: {
      create: jest.fn(({ data }: any) => {
        const rec = { id: `pn-${nextId++}`, ...data };
        pushNotificationsInDb.push(rec);
        return rec;
      }),
      update: jest.fn(({ where, data }: any) => {
        const idx = pushNotificationsInDb.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          pushNotificationsInDb[idx] = { ...pushNotificationsInDb[idx], ...data };
          return pushNotificationsInDb[idx];
        }
        return null;
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const ids = where.id?.in ?? [];
        let count = 0;
        for (const id of ids) {
          const idx = pushNotificationsInDb.findIndex((r) => r.id === id);
          if (idx >= 0) {
            pushNotificationsInDb[idx] = { ...pushNotificationsInDb[idx], ...data };
            count++;
          }
        }
        return { count };
      }),
      findMany: jest.fn(({ where }: any) => {
        const statuses = where.status?.in ?? [];
        const hasTicket = where.expoTicketId?.not === null;
        return pushNotificationsInDb.filter((r) => {
          if (statuses.length && !statuses.includes(r.status)) return false;
          if (hasTicket && !r.expoTicketId) return false;
          return true;
        });
      }),
    },
    user: {
      findUnique: jest.fn(({ where, select }: any) => {
        const u = usersInDb.get(where.id);
        if (!u) return null;
        if (where.merchantId && u.merchantId !== where.merchantId) {
          return null;
        }
        if (select) {
          const out: any = {};
          if (select.pushNotificationsEnabled) {
            out.pushNotificationsEnabled = u.pushNotificationsEnabled;
          }
          if (select.pushTokens) {
            out.pushTokens = [...u.pushTokens];
          }
          return out;
        }
        return cloneUser(u);
      }),
      update: jest.fn(({ where, data }: any) => {
        const u = usersInDb.get(where.id);
        if (!u) return null;
        if (data.pushTokens) {
          u.pushTokens = [...data.pushTokens];
        }
        return cloneUser(u);
      }),
    },
    $transaction: jest.fn(async (fn: (tx: MockTx) => Promise<any>) => {
      return fn(mockTx);
    }),
  };

  return {
    mockTx,
    pushNotificationsInDb,
    usersInDb,
    user: {
      findMany: jest.fn().mockResolvedValue([cloneUser(user1)]),
      findUnique: mockTx.user.findUnique,
      update: mockTx.user.update,
    },
    pushNotification: mockTx.pushNotification,
  };
}

describe("NotificationsService", () => {
  let service: NotificationsService;
  let sendPushNotificationsAsync: jest.Mock;
  let getPushNotificationReceiptsAsync: jest.Mock;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            user: prismaMock.user,
            pushNotification: prismaMock.pushNotification,
            $transaction: prismaMock.mockTx.$transaction,
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    const expoCtor = Expo as unknown as jest.Mock;
    const expoInstance = expoCtor.mock.results[expoCtor.mock.results.length - 1].value;
    sendPushNotificationsAsync = expoInstance.sendPushNotificationsAsync;
    getPushNotificationReceiptsAsync = expoInstance.getPushNotificationReceiptsAsync;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getSentPayload = () => {
    const messages = sendPushNotificationsAsync.mock.calls[0][0];
    return messages[0].data;
  };

  it("sends a deep-linkable payload for invoice.paid", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-2" },
    ]);

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
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-2" },
    ]);

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
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-2" },
    ]);

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
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-2" },
    ]);

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
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-2" },
    ]);

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

  it("persists send metadata with ticket correlation on success", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      { status: "ok", id: TICKET_ID_OK + "-b" },
    ]);

    const invoice = {
      id: "invoice-10",
      merchantId: "merchant-1",
      invoiceNumber: "INV-010",
      clientName: "Client X",
      amount: 200,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const records = prismaMock.pushNotificationsInDb;
    expect(records.length).toBe(2);
    for (const rec of records) {
      expect(rec.userId).toBe("user-1");
      expect(rec.merchantId).toBe("merchant-1");
      expect(rec.status).toBe("ticket_ok");
      expect(rec.expoTicketId).toBeDefined();
      expect(rec.eventType).toBe("invoice.paid");
    }
    expect(records[0].pushToken).toBe(VALID_TOKEN);
    expect(records[1].pushToken).toBe(BAD_TOKEN);
  });

  it("handles ticket errors and removes tokens on permanent failure at ticket stage", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
      {
        status: "error",
        message: "The device is no longer registered",
        details: { error: "DeviceNotRegistered" },
      },
    ]);

    const invoice = {
      id: "invoice-11",
      merchantId: "merchant-1",
      invoiceNumber: "INV-011",
      clientName: "Client Y",
      amount: 300,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const records = prismaMock.pushNotificationsInDb;
    expect(records.length).toBe(2);

    expect(records[0].status).toBe("ticket_ok");
    expect(records[0].expoTicketId).toBe(TICKET_ID_OK);

    expect(records[1].status).toBe("token_removed");
    expect(records[1].ticketError).toContain("no longer registered");
    expect(records[1].receiptFailureReason).toBe("DeviceNotRegistered");
    expect(records[1].removedTokenAt).toBeDefined();
    expect(records[1].removedTokenNote).toContain("DeviceNotRegistered");

    const user = prismaMock.usersInDb.get("user-1")!;
    expect(user.pushTokens).toEqual([VALID_TOKEN]);
    expect(user.pushTokens).not.toContain(BAD_TOKEN);
  });

  it("distinguishes retryable ticket errors from permanent ones (no token removal)", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      {
        status: "error",
        message: "Rate limit exceeded",
        details: { error: "MessageRateExceeded" },
      },
      {
        status: "error",
        message: "Provider down",
        details: { error: "ProviderError" },
      },
    ]);

    const invoice = {
      id: "invoice-12",
      merchantId: "merchant-1",
      invoiceNumber: "INV-012",
      clientName: "Client Z",
      amount: 400,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const records = prismaMock.pushNotificationsInDb;
    expect(records.length).toBe(2);
    for (const rec of records) {
      expect(rec.status).toBe("ticket_error");
      expect(rec.removedTokenAt).toBeUndefined();
    }
    expect(records[0].receiptFailureReason).toBe("MessageRateExceeded");
    expect(records[1].receiptFailureReason).toBe("ProviderError");

    const user = prismaMock.usersInDb.get("user-1")!;
    expect(user.pushTokens).toEqual([VALID_TOKEN, BAD_TOKEN]);
  });

  it("reconciles receipts: ok status marks receipt_ok", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_OK },
    ]);

    const invoice = {
      id: "invoice-13",
      merchantId: "merchant-1",
      invoiceNumber: "INV-013",
      clientName: "Client OK",
      amount: 500,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    getPushNotificationReceiptsAsync.mockResolvedValueOnce({
      [TICKET_ID_OK]: { status: "ok" },
    });

    await service["processReceipts"]();

    const records = prismaMock.pushNotificationsInDb;
    expect(records.length).toBeGreaterThanOrEqual(1);
    const updated = records.find((r) => r.expoTicketId === TICKET_ID_OK)!;
    expect(updated.status).toBe("receipt_ok");
    expect(updated.receiptStatus).toBe("ok");
    expect(updated.receiptFetchedAt).toBeDefined();
  });

  it("reconciles receipts: permanent failure removes token with audit trail", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_PERMANENT_FAIL },
      { status: "ok", id: TICKET_ID_OK },
    ]);

    const invoice = {
      id: "invoice-14",
      merchantId: "merchant-1",
      invoiceNumber: "INV-014",
      clientName: "Client Perm",
      amount: 600,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const permRecord = prismaMock.pushNotificationsInDb.find(
      (r) => r.expoTicketId === TICKET_ID_PERMANENT_FAIL,
    )!;
    permRecord.pushToken = BAD_TOKEN;

    getPushNotificationReceiptsAsync.mockResolvedValueOnce({
      [TICKET_ID_PERMANENT_FAIL]: {
        status: "error",
        message: "Not registered",
        details: { error: "DeviceNotRegistered" },
      },
      [TICKET_ID_OK]: { status: "ok" },
    });

    await service["processReceipts"]();

    const updatedPerm = prismaMock.pushNotificationsInDb.find(
      (r) => r.expoTicketId === TICKET_ID_PERMANENT_FAIL,
    )!;
    expect(updatedPerm.status).toBe("token_removed");
    expect(updatedPerm.receiptFailureReason).toBe("DeviceNotRegistered");
    expect(updatedPerm.removedTokenAt).toBeDefined();
    expect(updatedPerm.removedTokenNote).toContain("DeviceNotRegistered");

    const user = prismaMock.usersInDb.get("user-1")!;
    expect(user.pushTokens).not.toContain(BAD_TOKEN);

    const updatedOk = prismaMock.pushNotificationsInDb.find(
      (r) => r.expoTicketId === TICKET_ID_OK,
    )!;
    expect(updatedOk.status).toBe("receipt_ok");
  });

  it("reconciles receipts: retryable failures are marked receipt_error_retryable and preserved", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: TICKET_ID_RETRYABLE_FAIL },
    ]);

    const invoice = {
      id: "invoice-15",
      merchantId: "merchant-1",
      invoiceNumber: "INV-015",
      clientName: "Client Retry",
      amount: 700,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    getPushNotificationReceiptsAsync.mockResolvedValueOnce({
      [TICKET_ID_RETRYABLE_FAIL]: {
        status: "error",
        message: "Too many messages",
        details: { error: "MessageRateExceeded" },
      },
    });

    await service["processReceipts"]();

    const updated = prismaMock.pushNotificationsInDb.find(
      (r) => r.expoTicketId === TICKET_ID_RETRYABLE_FAIL,
    )!;
    expect(updated.status).toBe("receipt_error_retryable");
    expect(updated.receiptFailureReason).toBe("MessageRateExceeded");
    expect(updated.removedTokenAt).toBeUndefined();

    const user = prismaMock.usersInDb.get("user-1")!;
    expect(user.pushTokens.length).toBe(2);
  });

  it("classifies all permanent failure reasons correctly and removes tokens", async () => {
    const permanentErrors = [
      "DeviceNotRegistered",
      "DeviceNotRegisteredOnPlatform",
      "InvalidCredentials",
      "MessageTooBig",
    ];

    for (const error of permanentErrors) {
      const localMock = makePrismaMock();
      const localModule: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationsService,
          {
            provide: PrismaService,
            useValue: {
              user: localMock.user,
              pushNotification: localMock.pushNotification,
              $transaction: localMock.mockTx.$transaction,
            },
          },
        ],
      }).compile();
      const localService = localModule.get<NotificationsService>(NotificationsService);

      const localExpoCtor = Expo as unknown as jest.Mock;
      const localExpoInstance =
        localExpoCtor.mock.results[localExpoCtor.mock.results.length - 1].value;
      localExpoInstance.sendPushNotificationsAsync.mockResolvedValueOnce([
        {
          status: "error",
          message: `Permanent: ${error}`,
          details: { error },
        },
      ]);

      const invoice = {
        id: `inv-${error}`,
        merchantId: "merchant-1",
        invoiceNumber: `INV-${error}`,
        clientName: `Client ${error}`,
        amount: 100,
        assetCode: "XLM",
      } as unknown as Invoice;

      await localService.notifyInvoicePaid(invoice);

      const rec = localMock.pushNotificationsInDb[0];
      expect(rec.status).toBe("token_removed");
      expect(rec.receiptFailureReason).toBe(error);
      expect(rec.removedTokenAt).toBeDefined();
    }
  });

  it("classifies all retryable failure reasons correctly and preserves tokens", async () => {
    const retryableErrors = [
      "MessageRateExceeded",
      "ProviderError",
      "InvalidProviderError",
    ];

    for (const error of retryableErrors) {
      const localMock = makePrismaMock();
      const localModule: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationsService,
          {
            provide: PrismaService,
            useValue: {
              user: localMock.user,
              pushNotification: localMock.pushNotification,
              $transaction: localMock.mockTx.$transaction,
            },
          },
        ],
      }).compile();
      const localService = localModule.get<NotificationsService>(NotificationsService);

      const localExpoCtor = Expo as unknown as jest.Mock;
      const localExpoInstance =
        localExpoCtor.mock.results[localExpoCtor.mock.results.length - 1].value;
      localExpoInstance.sendPushNotificationsAsync.mockResolvedValueOnce([
        {
          status: "error",
          message: `Retryable: ${error}`,
          details: { error },
        },
      ]);

      const invoice = {
        id: `inv-retry-${error}`,
        merchantId: "merchant-1",
        invoiceNumber: `INV-R-${error}`,
        clientName: `Client R-${error}`,
        amount: 100,
        assetCode: "XLM",
      } as unknown as Invoice;

      await localService.notifyInvoicePaid(invoice);

      const rec = localMock.pushNotificationsInDb[0];
      expect(rec.status).toBe("ticket_error");
      expect(rec.receiptFailureReason).toBe(error);
      expect(rec.removedTokenAt).toBeUndefined();

      const user = localMock.usersInDb.get("user-1")!;
      expect(user.pushTokens.length).toBe(2);
    }
  });

  it("classifies Unknown failures as not-permanent (preserves token)", async () => {
    sendPushNotificationsAsync.mockResolvedValueOnce([
      {
        status: "error",
        message: "Weird error",
        details: { error: "SomeWeirdNewErrorCode" },
      },
    ]);

    const invoice = {
      id: "invoice-unknown",
      merchantId: "merchant-1",
      invoiceNumber: "INV-UNK",
      clientName: "Client Unk",
      amount: 100,
      assetCode: "XLM",
    } as unknown as Invoice;

    await service.notifyInvoicePaid(invoice);

    const rec = prismaMock.pushNotificationsInDb[0];
    expect(rec.status).toBe("ticket_error");
    expect(rec.receiptFailureReason).toBe("Unknown");
    expect(rec.removedTokenAt).toBeUndefined();

    const user = prismaMock.usersInDb.get("user-1")!;
    expect(user.pushTokens.length).toBe(2);
  });

  it("processReceipts is idempotent and skips when nothing pending", async () => {
    await service["processReceipts"]();
    expect(getPushNotificationReceiptsAsync).not.toHaveBeenCalled();
  });

  describe("getNotificationPreferences", () => {
    it("returns explicit saved preference with token count for a known user", async () => {
      const result = await service.getNotificationPreferences(
        "user-1",
        "merchant-1",
      );
      expect(result).toEqual({
        pushNotificationsEnabled: true,
        registeredPushTokensCount: 2,
        preferenceExplicit: true,
        contractVersion: "1.0.0",
      });
    });

    it("respects pushNotificationsEnabled = false on the user row", async () => {
      const user = prismaMock.usersInDb.get("user-1")!;
      user.pushNotificationsEnabled = false;

      const result = await service.getNotificationPreferences(
        "user-1",
        "merchant-1",
      );
      expect(result.pushNotificationsEnabled).toBe(false);
      expect(result.preferenceExplicit).toBe(true);
      expect(result.contractVersion).toBe("1.0.0");
    });

    it("returns the documented default (preferenceExplicit=false) when the user is missing / legacy record not found", async () => {
      const result = await service.getNotificationPreferences(
        "user-does-not-exist",
        "merchant-1",
      );
      expect(result).toEqual({
        pushNotificationsEnabled: true,
        registeredPushTokensCount: 0,
        preferenceExplicit: false,
        contractVersion: "1.0.0",
      });
    });

    it("returns the documented default when the userId doesn't match the merchant scope", async () => {
      const result = await service.getNotificationPreferences(
        "user-1",
        "merchant-does-not-belong",
      );
      expect(result).toEqual({
        pushNotificationsEnabled: true,
        registeredPushTokensCount: 0,
        preferenceExplicit: false,
        contractVersion: "1.0.0",
      });
    });

    it("returns registeredPushTokensCount=0 safely when legacy row has non-array pushTokens", async () => {
      const poisonedUser: any = {
        id: "user-legacy",
        merchantId: "merchant-1",
        pushNotificationsEnabled: true,
        pushTokens: null,
      };
      prismaMock.usersInDb.set(poisonedUser.id, poisonedUser);

      const result = await service.getNotificationPreferences(
        "user-legacy",
        "merchant-1",
      );
      expect(result.registeredPushTokensCount).toBe(0);
      expect(result.preferenceExplicit).toBe(true);
      expect(result.pushNotificationsEnabled).toBe(true);
    });

    it("falls back to pushNotificationsEnabled=true when legacy row has a non-boolean preference value", async () => {
      const poisonedUser: any = {
        id: "user-weird",
        merchantId: "merchant-1",
        pushNotificationsEnabled: null,
        pushTokens: ["Expo[x]"],
      };
      prismaMock.usersInDb.set(poisonedUser.id, poisonedUser);

      const result = await service.getNotificationPreferences(
        "user-weird",
        "merchant-1",
      );
      expect(result.pushNotificationsEnabled).toBe(true);
      expect(result.registeredPushTokensCount).toBe(1);
      expect(result.preferenceExplicit).toBe(true);
    });

    it("always returns the same stable contractVersion string", async () => {
      const [found, missing] = await Promise.all([
        service.getNotificationPreferences("user-1", "merchant-1"),
        service.getNotificationPreferences("missing", "merchant-1"),
      ]);
      expect(found.contractVersion).toBe("1.0.0");
      expect(missing.contractVersion).toBe("1.0.0");
    });
  });
});
