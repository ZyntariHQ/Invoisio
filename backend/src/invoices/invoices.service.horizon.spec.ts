import { Prisma } from "@prisma/client";
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

/** Helper to create an invoice stored as Prisma Decimal amounts (like real DB). */
function makeDecimalInvoiceAmounts(
  overrides: Record<string, any>,
): Record<string, any> {
  const result = { ...overrides };
  if (
    result.amount !== undefined &&
    !(result.amount instanceof Prisma.Decimal)
  ) {
    result.amount = new Prisma.Decimal(result.amount);
  }
  if (
    result.amountPaid !== undefined &&
    !(result.amountPaid instanceof Prisma.Decimal)
  ) {
    result.amountPaid = new Prisma.Decimal(result.amountPaid);
  }
  if (
    result.amountDue !== undefined &&
    !(result.amountDue instanceof Prisma.Decimal)
  ) {
    result.amountDue = new Prisma.Decimal(result.amountDue);
  }
  return result;
}

/**
 * Format a number to exactly 7 decimal places for assertion matching.
 * Mirrors the normalisation done by InvoicesService.toDecimalString().
 */
function d7(value: number | string): string {
  return new Prisma.Decimal(value).toFixed(7);
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
    // Store as Decimal to match real Prisma behaviour
    await prisma.invoice.create({
      data: makeDecimalInvoiceAmounts(invoice),
    });
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
    expect(result.invoice?.amountPaid).toBe(d7("125.25"));
    expect(result.invoice?.amountDue).toBe(d7("374.75"));
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
    expect(result.invoice?.amountPaid).toBe(d7("500"));
    expect(result.invoice?.amountDue).toBe(d7("0"));
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
    expect(result.invoice?.amountPaid).toBe(d7("650"));
    expect(result.invoice?.amountDue).toBe(d7("0"));
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
    expect(result.invoice?.amountPaid).toBe(d7("500"));
    expect(result.invoice?.amountDue).toBe(d7("0"));
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
    expect(result.invoice?.amountPaid).toBe(d7("0"));
    expect(result.invoice?.amountDue).toBe(d7("500"));
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
    expect(replayed.invoice?.amountPaid).toBe(d7("125"));
    expect(replayed.invoice?.amountDue).toBe(d7("375"));
    expect((prisma as any).payment._store).toHaveLength(1);
    expect((prisma as any).paymentReview._store).toHaveLength(1);
  });
});

describe("InvoicesService — decimal precision (issue #457)", () => {
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

  const createDecimalInvoice = async (overrides: Record<string, any> = {}) => {
    const invoice = {
      id: overrides.id ?? "decimal-inv-1",
      merchantId: overrides.merchantId ?? "merchant-1",
      userId: "user-1",
      invoiceNumber: overrides.invoiceNumber ?? "INV-DEC-1",
      clientName: "Client",
      clientEmail: "client@example.com",
      amount: overrides.amount ?? "100.1234567",
      amountPaid: overrides.amountPaid ?? "0",
      amountDue: overrides.amountDue ?? overrides.amount ?? "100.1234567",
      assetCode: overrides.assetCode ?? "USDC",
      assetIssuer:
        overrides.assetIssuer ??
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      memo: overrides.memo ?? "999999",
      memoType: "ID",
      status: overrides.status ?? "pending",
      destinationAddress:
        "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: overrides.txHash ?? null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await prisma.invoice.create({
      data: makeDecimalInvoiceAmounts({ ...invoice, ...overrides }),
    });
    return invoice;
  };

  it("settles when partial payments sum exactly to seven-decimal invoice amount", async () => {
    await createDecimalInvoice({
      id: "dec-exact-1",
      amount: "0.3000000",
      amountDue: "0.3000000",
      amountPaid: "0",
    });

    // First partial: 0.1000000
    const r1 = await service.applyHorizonPayment({
      txHash: "dec-p1",
      memo: "999999",
      amount: "0.1000000",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(r1.invoice?.status).toBe("partially_paid");
    expect(r1.invoice?.amountPaid).toBe(d7("0.1"));
    expect(r1.invoice?.amountDue).toBe(d7("0.2"));

    // Second partial: 0.1000000
    const r2 = await service.applyHorizonPayment({
      txHash: "dec-p2",
      memo: "999999",
      amount: "0.1000000",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(r2.invoice?.status).toBe("partially_paid");
    expect(r2.invoice?.amountPaid).toBe(d7("0.2"));
    expect(r2.invoice?.amountDue).toBe(d7("0.1"));

    // Third partial: 0.1000000 — exactly clears the invoice
    const r3 = await service.applyHorizonPayment({
      txHash: "dec-p3",
      memo: "999999",
      amount: "0.1000000",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(r3.invoice?.status).toBe("paid");
    expect(r3.invoice?.amountPaid).toBe(d7("0.3"));
    expect(r3.invoice?.amountDue).toBe(d7("0"));
    expect(notifications.notifyInvoicePaid).toHaveBeenCalled();
  });

  it("produces no dust residue after accumulating many tiny seven-decimal payments", async () => {
    await createDecimalInvoice({
      id: "dec-dust-1",
      amount: "1.0000000",
      amountDue: "1.0000000",
      amountPaid: "0",
    });

    for (let i = 1; i <= 9; i++) {
      const r = await service.applyHorizonPayment({
        txHash: `dust-p${i}`,
        memo: "999999",
        amount: "0.1000000",
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      });
      expect(r.invoice?.status).toBe("partially_paid");
      expect(r.invoice?.amountDue).toBe(d7(String(1 - i * 0.1)));
    }

    // Final payment
    const r10 = await service.applyHorizonPayment({
      txHash: "dust-p10",
      memo: "999999",
      amount: "0.1000000",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(r10.invoice?.status).toBe("paid");
    expect(r10.invoice?.amountPaid).toBe(d7("1.0"));
    expect(r10.invoice?.amountDue).toBe(d7("0"));
  });

  it("handles amounts beyond Number.MAX_SAFE_INTEGER without precision loss", async () => {
    const hugeAmount = "9007199254740993.0000000";
    await createDecimalInvoice({
      id: "dec-huge-1",
      amount: hugeAmount,
      amountDue: hugeAmount,
      amountPaid: "0",
    });

    const result = await service.applyHorizonPayment({
      txHash: "huge-p1",
      memo: "999999",
      amount: hugeAmount,
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    expect(result.invoice?.status).toBe("paid");
    expect(result.invoice?.amountPaid).toBe(d7(hugeAmount));
    expect(result.invoice?.amountDue).toBe(d7("0"));
  });

  it("produces no dust when repeatedly paying 0.0000001 on a 0.0000007 invoice", async () => {
    await createDecimalInvoice({
      id: "dec-micro-1",
      amount: "0.0000007",
      amountDue: "0.0000007",
      amountPaid: "0",
    });

    // Pay in seven increments of 0.0000001
    for (let i = 1; i <= 6; i++) {
      const r = await service.applyHorizonPayment({
        txHash: `micro-p${i}`,
        memo: "999999",
        amount: "0.0000001",
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      });
      expect(r.invoice?.status).toBe("partially_paid");
    }

    const r7 = await service.applyHorizonPayment({
      txHash: "micro-p7",
      memo: "999999",
      amount: "0.0000001",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(r7.invoice?.status).toBe("paid");
    expect(r7.invoice?.amountPaid).toBe(d7("0.0000007"));
    expect(r7.invoice?.amountDue).toBe(d7("0"));
  });
});
