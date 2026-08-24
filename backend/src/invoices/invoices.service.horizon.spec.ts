import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

class FakePrisma {
  invoice = {
    _store: new Map<string, any>(),
    findFirst: async ({ where: { id, memo } }: any) => {
      const rows = Array.from(
        (FakePrisma as any).instance.invoice._store.values(),
      );
      if (id) return rows.find((row: any) => row.id === id) ?? null;
      if (memo) return rows.find((row: any) => row.memo === memo) ?? null;
      return null;
    },
    findUnique: async ({ where: { id } }: any) => {
      return (FakePrisma as any).instance.invoice._store.get(id) ?? null;
    },
    update: async ({ where: { id }, data }: any) => {
      const current = (FakePrisma as any).instance.invoice._store.get(id);
      const next = { ...current, ...data };
      delete next.payments;
      delete next.statusHistory;
      if (data.payments?.create) {
        await (FakePrisma as any).instance.payment.create({
          data: { invoiceId: id, ...data.payments.create },
        });
      }
      (FakePrisma as any).instance.invoice._store.set(id, next);
      return next;
    },
    create: async ({ data }: any) => {
      (FakePrisma as any).instance.invoice._store.set(data.id, { ...data });
      return { ...data };
    },
  };

  payment = {
    _store: [] as any[],
    create: async ({ data }: any) => {
      if (data.txHash) {
        const duplicate = (FakePrisma as any).instance.payment._store.find(
          (payment: any) => payment.txHash === data.txHash,
        );
        if (duplicate) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
      }
      const row = {
        id: `payment-${(FakePrisma as any).instance.payment._store.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      (FakePrisma as any).instance.payment._store.push(row);
      return row;
    },
  };

  paymentReview = {
    _store: [] as any[],
    create: async ({ data }: any) => {
      const duplicate = (FakePrisma as any).instance.paymentReview._store.find(
        (review: any) => review.txHash === data.txHash,
      );
      if (duplicate) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const row = {
        id: `review-${(FakePrisma as any).instance.paymentReview._store.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      (FakePrisma as any).instance.paymentReview._store.push(row);
      return row;
    },
  };

  processedEvent = {
    _store: new Map<string, any>(),
    findUnique: async ({ where: { txHash_invoiceId_contractId } }: any) => {
      const key = JSON.stringify(txHash_invoiceId_contractId);
      return (
        (FakePrisma as any).instance.processedEvent._store.get(key) ?? null
      );
    },
    create: async ({ data }: any) => {
      const key = JSON.stringify({
        txHash: data.txHash,
        invoiceId: data.invoiceId,
        contractId: data.contractId,
      });
      if ((FakePrisma as any).instance.processedEvent._store.has(key)) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const row = { id: 1, processedAt: new Date(), ...data };
      (FakePrisma as any).instance.processedEvent._store.set(key, row);
      return row;
    },
  };

  static instance: FakePrisma;

  constructor() {
    (FakePrisma as any).instance = this;
  }
}

describe("InvoicesService.applyHorizonPayment", () => {
  let service: InvoicesService;
  let prisma: FakePrisma;
  let webhooks: { enqueueWebhook: jest.Mock };
  let notifications: {
    notifyInvoicePaid: jest.Mock;
    notifyInvoiceOverdue: jest.Mock;
    notifyPaymentReviewFlagged: jest.Mock;
  };

  beforeEach(() => {
    prisma = new FakePrisma();
    webhooks = { enqueueWebhook: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyInvoicePaid: jest.fn().mockResolvedValue(undefined),
      notifyInvoiceOverdue: jest.fn().mockResolvedValue(undefined),
      notifyPaymentReviewFlagged: jest.fn().mockResolvedValue(undefined),
    };
    service = new InvoicesService(
      {
        getMerchantPublicKey: () =>
          "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      } as unknown as StellarService,
      {} as unknown as SorobanService,
      prisma as any,
      webhooks as unknown as WebhooksService,
      notifications as unknown as NotificationsService,
      mockStructuredLogger as unknown as StructuredLogger,
    );
  });

  const createInvoice = async (overrides: Record<string, any> = {}) => {
    const invoice = {
      id: overrides.id ?? "invoice-1",
      merchantId: overrides.merchantId ?? "merchant-1",
      userId: "user-1",
      invoiceNumber: overrides.invoiceNumber ?? "INV-1",
      clientName: "Client",
      clientEmail: "client@example.com",
      amount: overrides.amount ?? 500,
      amountPaid: overrides.amountPaid ?? 0,
      amountDue: overrides.amountDue ?? overrides.amount ?? 500,
      assetCode: overrides.assetCode ?? "USDC",
      assetIssuer:
        overrides.assetIssuer ??
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      memo: overrides.memo ?? "123456",
      memoType: "ID",
      status: overrides.status ?? "pending",
      destinationAddress:
        "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: overrides.txHash ?? null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    await prisma.invoice.create({ data: invoice });
    return invoice;
  };

  it("keeps an underpaid Horizon payment partially paid with ledger amounts updated", async () => {
    await createInvoice();

    const result = await service.applyHorizonPayment({
      txHash: "horizon-underpaid",
      memo: "123456",
      amount: "125.25",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    expect(result.invoice?.status).toBe("partially_paid");
    expect(result.invoice?.amountPaid).toBe(125.25);
    expect(result.invoice?.amountDue).toBe(374.75);
    expect(result.review?.issueType).toBe("underpaid");
    expect(notifications.notifyInvoicePaid).not.toHaveBeenCalled();
    expect(notifications.notifyPaymentReviewFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ issueType: "underpaid" }),
    );
  });

  it("marks an exact Horizon payment paid with consistent amountPaid and amountDue", async () => {
    await createInvoice();

    const result = await service.applyHorizonPayment({
      txHash: "horizon-exact",
      memo: "123456",
      amount: "500",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    expect(result.invoice?.status).toBe("paid");
    expect(result.invoice?.amountPaid).toBe(500);
    expect(result.invoice?.amountDue).toBe(0);
    expect(result.review).toBeNull();
    expect(notifications.notifyInvoicePaid).toHaveBeenCalled();
  });

  it("settles an overpaid Horizon payment and creates an overpayment review", async () => {
    await createInvoice();

    const result = await service.applyHorizonPayment({
      txHash: "horizon-overpaid",
      memo: "123456",
      amount: "650",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    expect(result.invoice?.status).toBe("paid");
    expect(result.invoice?.amountPaid).toBe(650);
    expect(result.invoice?.amountDue).toBe(0);
    expect(result.review?.issueType).toBe("overpaid");
    expect(notifications.notifyPaymentReviewFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ issueType: "overpaid" }),
    );
  });

  it("flags a new Horizon payment for an already paid invoice as overpaid without double-counting", async () => {
    await createInvoice({
      status: "paid",
      amountPaid: 500,
      amountDue: 0,
      txHash: "horizon-original",
    });

    const result = await service.applyHorizonPayment({
      txHash: "horizon-after-paid",
      memo: "123456",
      amount: "25",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    expect(result.invoice?.status).toBe("paid");
    expect(result.invoice?.amountPaid).toBe(500);
    expect(result.invoice?.amountDue).toBe(0);
    expect(result.review?.issueType).toBe("overpaid");
    expect((prisma as any).payment._store).toHaveLength(0);
  });

  it("does not settle a Horizon payment with the wrong asset", async () => {
    await createInvoice();

    const result = await service.applyHorizonPayment({
      txHash: "horizon-wrong-asset",
      memo: "123456",
      amount: "500",
      asset_code: "XLM",
    });

    expect(result.invoice?.status).toBe("pending");
    expect(result.invoice?.amountPaid).toBe(0);
    expect(result.invoice?.amountDue).toBe(500);
    expect(result.review?.issueType).toBe("asset_mismatch");
    expect(notifications.notifyInvoicePaid).not.toHaveBeenCalled();
  });

  it("does not double-count a redelivered Horizon payment record", async () => {
    await createInvoice();
    const payment = {
      txHash: "horizon-replay",
      memo: "123456",
      amount: "125",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    };

    await service.applyHorizonPayment(payment);
    const replayed = await service.applyHorizonPayment(payment);

    expect(replayed.invoice?.status).toBe("partially_paid");
    expect(replayed.invoice?.amountPaid).toBe(125);
    expect(replayed.invoice?.amountDue).toBe(375);
    expect((prisma as any).payment._store).toHaveLength(1);
    expect((prisma as any).paymentReview._store).toHaveLength(1);
  });
});
