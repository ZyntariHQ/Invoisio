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
    findUnique: async ({ where: { id, memo } }: any) => {
      if (id)
        return (FakePrisma as any).instance.invoice._store.get(id) || null;
      if (memo) {
        for (const v of (FakePrisma as any).instance.invoice._store.values()) {
          if (v.memo === memo) return v;
        }
        return null;
      }
      return null;
    },
    findFirst: async ({ where: { id, memo } }: any) => {
      if (id)
        return (FakePrisma as any).instance.invoice._store.get(id) || null;
      if (memo) {
        for (const v of (FakePrisma as any).instance.invoice._store.values()) {
          if (v.memo === memo) return v;
        }
        return null;
      }
      return null;
    },
    count: async () => (FakePrisma as any).instance.invoice._store.size,
    create: async ({ data }: any) => {
      (FakePrisma as any).instance.invoice._store.set(data.id, { ...data });
      return { ...data };
    },
    update: async ({ where: { id }, data }: any) => {
      const current = (FakePrisma as any).instance.invoice._store.get(id);
      const next = { ...current, ...data };
      (FakePrisma as any).instance.invoice._store.set(id, next);
      return next;
    },
    findMany: async () =>
      Array.from((FakePrisma as any).instance.invoice._store.values()),
  };
  invoiceStatusHistory = {
    create: async ({ data }: any) => {
      return { id: "fake-id", ...data, createdAt: new Date() };
    },
  };
  payment = {
    _store: [] as any[],
    create: async ({ data }: any) => {
      if (data.txHash) {
        const dup = (FakePrisma as any).instance.payment._store.find(
          (p: any) => p.txHash === data.txHash,
        );
        if (dup) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
      }
      const row = {
        id: `pay-${(FakePrisma as any).instance.payment._store.length}`,
        ...data,
        createdAt: new Date(),
      };
      (FakePrisma as any).instance.payment._store.push(row);
      return row;
    },
  };
  paymentReview = {
    _store: [] as any[],
    create: async ({ data }: any) => {
      const dup = (FakePrisma as any).instance.paymentReview._store.find(
        (review: any) => review.txHash === data.txHash,
      );
      if (dup) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const row = {
        id: `review-${(FakePrisma as any).instance.paymentReview._store.length}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        (FakePrisma as any).instance.processedEvent._store.get(key) || null
      );
    },
    create: async ({ data }: any) => {
      const key = JSON.stringify({
        txHash: data.txHash,
        invoiceId: data.invoiceId,
        contractId: data.contractId,
      });
      const row = { id: 1, processedAt: new Date(), ...data };
      (FakePrisma as any).instance.processedEvent._store.set(key, row);
      return row;
    },
  };
  static instance: any;
  constructor() {
    (FakePrisma as any).instance = this;
  }
}

/** Helper to wrap amounts as Prisma Decimal (like real DB storage). */
function asDecimal(amount: any): Prisma.Decimal {
  if (amount instanceof Prisma.Decimal) return amount;
  return new Prisma.Decimal(amount ?? 0);
}

/**
 * Format a number to exactly 7 decimal places for assertion matching.
 * Mirrors the normalisation done by InvoicesService.toDecimalString().
 */
function d7(value: number | string): string {
  return new Prisma.Decimal(value).toFixed(7);
}

describe("InvoicesService.applySorobanPaymentEvent", () => {
  let service: InvoicesService;
  let prisma: any;

  const stellarStub = {
    parseMemo: (memo: string) =>
      memo.startsWith("invoisio-") ? memo.slice("invoisio-".length) : null,
    getMerchantPublicKey: () =>
      "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  } as unknown as StellarService;

  const sorobanStub = {} as unknown as SorobanService;
  const webhooksStub = {
    enqueueWebhook: async () => {},
  } as unknown as WebhooksService;

  const notificationsStub = {
    notifyInvoicePaid: async () => {},
    notifyInvoiceOverdue: async () => {},
    notifyPaymentReviewFlagged: async () => {},
  } as unknown as NotificationsService;

  const structuredLoggerStub =
    mockStructuredLogger as unknown as StructuredLogger;

  beforeEach(async () => {
    prisma = new FakePrisma();
    service = new InvoicesService(
      stellarStub,
      sorobanStub,
      prisma,
      webhooksStub,
      notificationsStub,
      structuredLoggerStub,
    );
  });

  it("marks invoice paid and writes soroban metadata", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "A",
        amount: asDecimal(1000),
        asset_code: "XLM",
        memo: "123",
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const res = await service.applySorobanPaymentEvent({
      eventId: "evt-123",
      contractId: "C123",
      ledger: 999,
      invoice_id: `invoisio-${id}`,
      payer: "GPAAYER",
      asset_code: "XLM",
      asset_issuer: "",
      amount: "1000",
    });

    expect(res?.status).toBe("paid");
    expect(res?.tx_hash).toBe("soroban:evt-123");
    expect(res?.amountPaid).toBe(d7("1000"));
    expect(res?.amountDue).toBe(d7("0"));
    const stored = await prisma.invoice.findUnique({ where: { id } });
    expect(stored.metadata?.soroban?.lastEventId).toBe("evt-123");
    expect(stored.metadata?.soroban?.ledger).toBe(999);
  });

  it("is idempotent on repeated events", async () => {
    const id = "4cc74bbf-2a82-4f87-9e44-8b3b3b3b3b3b";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "B",
        amount: asDecimal(500),
        asset_code: "XLM",
        memo: "456",
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await service.applySorobanPaymentEvent({
      eventId: "evt-1",
      invoice_id: `invoisio-${id}`,
      amount: "500",
    } as any);
    const first = await prisma.invoice.findUnique({ where: { id } });
    await service.applySorobanPaymentEvent({
      eventId: "evt-1",
      invoice_id: `invoisio-${id}`,
      amount: "500",
    } as any);
    const normalized = await service.findOne(id, "dummyMerchantId");
    expect(first.status).toBe("paid");
    expect(normalized.status).toBe("paid");
    expect(normalized.amountPaid).toBe(d7("500"));
    expect(normalized.amountDue).toBe(d7("0"));
    expect(normalized.tx_hash).toBe("soroban:evt-1");
  });

  it("does not double-count amountPaid when a partial-payment event is replayed", async () => {
    const id = "7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "C",
        amount: asDecimal(1000),
        amountPaid: asDecimal(0),
        amountDue: asDecimal(1000),
        asset_code: "XLM",
        memo: "789",
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const event = {
      eventId: "evt-partial-1",
      contractId: "Cpartial",
      invoice_id: `invoisio-${id}`,
      amount: "300",
    } as any;

    const warnSpy = jest
      .spyOn((service as any).logger, "warn")
      .mockImplementation(() => {});

    const first = await service.applySorobanPaymentEvent(event);
    expect(first?.status).toBe("partially_paid");
    expect(first?.amountPaid).toBe(d7("300"));
    expect(first?.amountDue).toBe(d7("700"));

    const replayed = await service.applySorobanPaymentEvent(event);
    expect(replayed?.status).toBe("partially_paid");
    expect(replayed?.amountPaid).toBe(d7("300"));
    expect(replayed?.amountDue).toBe(d7("700"));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipped replayed soroban payment"),
    );

    warnSpy.mockRestore();
  });
});

describe("InvoicesService.applySorobanPaymentEvent — decimal precision", () => {
  let service: InvoicesService;
  let prisma: any;

  const stellarStub = {
    parseMemo: (memo: string) =>
      memo.startsWith("invoisio-") ? memo.slice("invoisio-".length) : null,
    getMerchantPublicKey: () =>
      "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  } as unknown as StellarService;

  const sorobanStub = {} as unknown as SorobanService;
  const webhooksStub = {
    enqueueWebhook: async () => {},
  } as unknown as WebhooksService;
  const notificationsStub = {
    notifyInvoicePaid: async () => {},
    notifyInvoiceOverdue: async () => {},
    notifyPaymentReviewFlagged: async () => {},
  } as unknown as NotificationsService;
  const structuredLoggerStub =
    mockStructuredLogger as unknown as StructuredLogger;

  beforeEach(async () => {
    prisma = new FakePrisma();
    service = new InvoicesService(
      stellarStub,
      sorobanStub,
      prisma,
      webhooksStub,
      notificationsStub,
      structuredLoggerStub,
    );
  });

  it("settles after repeated partial Soroban events that sum exactly to invoice amount", async () => {
    const id = "soro-prec-1";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "SoroPrecision",
        amount: asDecimal("0.7000000"),
        amountPaid: asDecimal("0"),
        amountDue: asDecimal("0.7000000"),
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        memo: "soro-m1",
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Six payments of 0.1000000
    for (let i = 1; i <= 6; i++) {
      const r = await service.applySorobanPaymentEvent({
        eventId: `soro-evt-${i}`,
        contractId: "Csoro1",
        invoice_id: `invoisio-${id}`,
        amount: "0.1000000",
      });
      expect(r?.status).toBe("partially_paid");
      expect(r?.amountDue).toBe(d7(String(0.7 - i * 0.1)));
    }

    // Seventh payment — should settle
    const r7 = await service.applySorobanPaymentEvent({
      eventId: "soro-evt-7",
      contractId: "Csoro1",
      invoice_id: `invoisio-${id}`,
      amount: "0.1000000",
    });
    expect(r7?.status).toBe("paid");
    expect(r7?.amountPaid).toBe(d7("0.7"));
    expect(r7?.amountDue).toBe(d7("0"));
  });

  it("handles large amounts beyond safe integer range via Soroban events", async () => {
    const id = "soro-prec-2";
    const hugeAmount = "9999999999999.9999999";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "SoroHuge",
        amount: asDecimal(hugeAmount),
        amountPaid: asDecimal("0"),
        amountDue: asDecimal(hugeAmount),
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        memo: "soro-m2",
        memo_type: "ID",
        status: "pending",
        tx_hash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const r = await service.applySorobanPaymentEvent({
      eventId: "soro-evt-big",
      contractId: "Csoro2",
      invoice_id: `invoisio-${id}`,
      amount: hugeAmount,
    });
    expect(r?.status).toBe("paid");
    expect(r?.amountPaid).toBe(d7(hugeAmount));
    expect(r?.amountDue).toBe(d7("0"));
  });
});
