import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";

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
    sendPaymentRequestEmail: async () => {},
    notifyInvoicePaid: async () => {},
    notifyInvoiceOverdue: async () => {},
  } as unknown as NotificationsService;

  beforeEach(async () => {
    prisma = new FakePrisma();
    service = new InvoicesService(
      stellarStub,
      sorobanStub,
      prisma,
      webhooksStub,
      notificationsStub,
    );
  });

  it("marks invoice paid and writes soroban metadata", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "A",
        amount: 1000,
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
      amount: "10000000",
    });

    expect(res?.status).toBe("paid");
    expect(res?.tx_hash).toBe("soroban:evt-123");
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
        amount: 500,
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
    expect(normalized.tx_hash).toBe("soroban:evt-1");
  });

  it("does not double-count amountPaid when a partial-payment event is replayed", async () => {
    const id = "7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
    await prisma.invoice.create({
      data: {
        id,
        clientName: "C",
        amount: 1000,
        amountPaid: 0,
        amountDue: 1000,
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
    expect(Number((first as any).amountPaid)).toBe(300);

    const replayed = await service.applySorobanPaymentEvent(event);
    expect(replayed?.status).toBe("partially_paid");
    expect(Number((replayed as any).amountPaid)).toBe(300);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipped replayed Soroban payment event"),
    );

    warnSpy.mockRestore();
  });
});
