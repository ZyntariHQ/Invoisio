import { Test, TestingModule } from "@nestjs/testing";
import { SorobanEventsService } from "./soroban-events.service";
import { ConfigService } from "@nestjs/config";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import {
  mockRequestContextService,
  mockStructuredLogger,
} from "../observability/testing/observability.mock";

describe("SorobanEventsService", () => {
  let service: SorobanEventsService;
  const applySpy = jest.fn();

  const mockPrismaService = {
    watcherCursor: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ updatedAt: new Date() }),
    },
    watcherDeadLetter: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "stellar") {
        return {
          sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          sorobanContractId:
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
          sorobanEventTopic: "InvoicePaymentRecorded",
        };
      }
      if (key === "SOROBAN_RETRY_DELAY_MS") return "0";
      return null;
    }),
  };

  const mockInvoicesService = {
    applySorobanPaymentEvent: applySpy,
  };

  beforeEach(async () => {
    applySpy.mockReset();
    mockPrismaService.watcherCursor.findUnique.mockResolvedValue(null);
    mockPrismaService.watcherCursor.upsert.mockClear();
    mockPrismaService.watcherDeadLetter.upsert.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanEventsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
        {
          provide: StructuredLogger,
          useValue: mockStructuredLogger,
        },
      ],
    }).compile();

    service = module.get<SorobanEventsService>(SorobanEventsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  /** Stub the private RPC fetch for tests that go through onModuleInit. */
  function stubFetchEvents(events: any[]) {
    (service as any).fetchEvents = jest.fn().mockResolvedValue({
      result: { events },
    });
  }

  /** Stub the private RPC fetch and run exactly one poll cycle synchronously
   *  (the real scheduler would re-tick every 50ms against the same stub). */
  async function runTickOnce(events: any[]) {
    (service as any).fetchEvents = jest.fn().mockResolvedValue({
      result: { events },
    });
    // tick() is normally reached via onModuleInit's scheduler.
    (service as any).running = true;
    try {
      await (service as any).tick();
    } finally {
      (service as any).running = false;
    }
  }

  function makeEvent(overrides: Record<string, any> = {}) {
    return {
      id: `evt-${Math.random().toString(36).slice(2, 8)}`,
      pagingToken: Math.ceil(Math.random() * 1_000_000).toString(),
      topic: ["InvoicePaymentRecorded"],
      ledger: 123,
      value: {
        invoice_id: "invoisio-550e8400-e29b-41d4-a716-446655440000",
        payer: "GCBZQY7M2K6Z2QG2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2",
        asset_code: "XLM",
        asset_issuer: "",
        amount: "10000000",
      },
      ...overrides,
    };
  }

  describe("cursor persistence", () => {
    beforeEach(() => {
      mockPrismaService.watcherCursor.findUnique.mockResolvedValue(null);
    });

    it("resumes from the persisted cursor on boot instead of re-deriving a start point", async () => {
      const persistedAt = new Date(Date.now() - 60_000);
      mockPrismaService.watcherCursor.findUnique.mockResolvedValue({
        watcher: "soroban",
        cursor: "ledger-98765",
        updatedAt: persistedAt,
      });
      stubFetchEvents([]);

      await service.onModuleInit();

      expect(mockPrismaService.watcherCursor.findUnique).toHaveBeenCalledWith({
        where: { watcher: "soroban" },
      });
      expect(service.getCursorState()).toEqual({
        watcher: "soroban",
        cursor: "ledger-98765",
        cursorUpdatedAt: persistedAt,
        resumed: true,
      });
    });

    it("starts with no cursor only on a genuine first run", async () => {
      mockPrismaService.watcherCursor.findUnique.mockResolvedValue(null);
      stubFetchEvents([]);

      await service.onModuleInit();

      expect(service.getCursorState().cursor).toBeUndefined();
    });

    it("checkpoints the cursor after every processed event batch", async () => {
      const e1 = makeEvent({ id: "e-1", pagingToken: "100" });
      const e2 = makeEvent({ id: "e-2", pagingToken: "200" });
      await runTickOnce([e1, e2]);

      expect(mockPrismaService.watcherCursor.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.watcherCursor.upsert).toHaveBeenLastCalledWith({
        where: { watcher: "soroban" },
        create: { watcher: "soroban", cursor: "200" },
        update: { cursor: "200" },
      });
      expect(service.getCursorState().cursor).toBe("200");
    });

    it("retries a transient failure and does not skip the event", async () => {
      applySpy
        .mockRejectedValueOnce(new Error("transient db blip"))
        .mockRejectedValueOnce(new Error("transient db blip"))
        .mockResolvedValueOnce({});
      const ev = makeEvent({ id: "flaky", pagingToken: "300" });
      await runTickOnce([ev]);

      expect(applySpy).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.watcherDeadLetter.upsert).not.toHaveBeenCalled();
      expect(service.getCursorState().cursor).toBe("300");
    });

    it("dead-letters a poison event after exhausting retries and keeps consuming", async () => {
      const poisonInvoiceId = "invoisio-550e8400-e29b-41d4-a716-446655440000";
      applySpy.mockImplementation(async (input: any) => {
        if (input.invoice_id === poisonInvoiceId) {
          throw new Error("permanent constraint violation");
        }
      });
      const poison = makeEvent({ id: "poison", pagingToken: "400" });
      const next = makeEvent({
        id: "after-poison",
        pagingToken: "500",
        value: {
          invoice_id: "invoisio-99999999-9999-9999-9999-999999999999",
          amount: "5000000",
        },
      });
      await runTickOnce([poison, next]);

      // Bounded retry budget respected before quarantine.
      expect(applySpy).toHaveBeenCalledTimes(4); // 3 for poison + 1 for next
      expect(mockPrismaService.watcherDeadLetter.upsert).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPrismaService.watcherDeadLetter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            watcher_recordId: { watcher: "soroban", recordId: "poison" },
          },
          update: expect.objectContaining({
            lastError: "permanent constraint violation",
            errorCount: { increment: 1 },
          }),
        }),
      );
      // Watcher not stalled: cursor advanced past the dead-lettered event.
      expect(service.getCursorState().cursor).toBe("500");
    });

    it("halts advancement when even the dead-letter write fails", async () => {
      applySpy.mockRejectedValue(new Error("permanent failure"));
      mockPrismaService.watcherDeadLetter.upsert.mockRejectedValue(
        new Error("database unavailable"),
      );
      const poison = makeEvent({ id: "poison-db-down", pagingToken: "600" });
      await runTickOnce([poison]);

      // No silent skip: cursor remains where it was before the poison event.
      expect(service.getCursorState().cursor).toBeUndefined();
      expect(mockPrismaService.watcherCursor.upsert).not.toHaveBeenCalled();
    });
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("ignores events without matching topic", async () => {
    const ev = {
      id: "evt1",
      topic: ["OtherTopic"],
      value: {
        invoice_id: "invoisio-123",
      },
    };
    await service.handleEvent(ev);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("parses a minimized payment_recorded event (issue #512: invoice_id + schema_version only) and forwards its invoice_id", async () => {
    // As of issue #512 the on-chain event no longer carries payer/asset/
    // amount — only schema_version and invoice_id.
    const ev = {
      id: "evt2",
      topic: ["InvoicePaymentRecorded"],
      ledger: 123,
      value: {
        invoice_id: "invoisio-550e8400-e29b-41d4-a716-446655440000",
        schema_version: 2,
      },
    };
    // No read client configured in this test (mockConfigService omits
    // merchantPublicKey/networkPassphrase) — enrichment is skipped and the
    // payer/asset/amount fields degrade to undefined rather than throwing.
    await service.handleEvent(ev);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt2",
        invoice_id: "invoisio-550e8400-e29b-41d4-a716-446655440000",
        payer: undefined,
        asset_code: undefined,
        asset_issuer: undefined,
        amount: undefined,
      }),
    );
  });

  it("enriches a minimized event with the full record via get_payment(invoice_id) (issue #512)", async () => {
    const ev = {
      id: "evt3",
      topic: ["InvoicePaymentRecorded"],
      ledger: 124,
      value: {
        invoice_id: "invoisio-enrich-test",
        schema_version: 2,
      },
    };
    (service as any).fetchPaymentRecord = jest.fn().mockResolvedValue({
      payer: "GCBZQY7M2K6Z2QG2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2",
      asset_code: "XLM",
      asset_issuer: "",
      amount: "10000000",
    });

    await service.handleEvent(ev);

    expect(applySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt3",
        invoice_id: "invoisio-enrich-test",
        payer: "GCBZQY7M2K6Z2QG2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2",
        asset_code: "XLM",
        amount: "10000000",
      }),
    );
  });
});
