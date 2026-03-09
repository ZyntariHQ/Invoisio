import { InvoicesService } from "./invoices.service";
import { ConfigService } from "@nestjs/config";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { WebhooksService } from "../webhooks/webhooks.service";

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
  static instance: any;
  constructor() {
    (FakePrisma as any).instance = this;
  }
}

describe("InvoicesService.applySorobanPaymentEvent", () => {
  let service: InvoicesService;
  let prisma: any;
  const cfg = new ConfigService();

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

  beforeEach(async () => {
    prisma = new FakePrisma();
    service = new InvoicesService(
      cfg,
      stellarStub,
      sorobanStub,
      prisma,
      webhooksStub,
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
    } as any);
    const first = await prisma.invoice.findUnique({ where: { id } });
    await service.applySorobanPaymentEvent({
      eventId: "evt-1",
      invoice_id: `invoisio-${id}`,
    } as any);
    const normalized = await service.findOne(id);
    expect(first.status).toBe("paid");
    expect(normalized.status).toBe("paid");
    expect(normalized.tx_hash).toBe("soroban:evt-1");
  });
});
