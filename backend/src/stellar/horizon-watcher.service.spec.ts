import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SorobanContractError } from "@invoisio/soroban-client";
import { HorizonWatcherService } from "./horizon-watcher.service";
import { StellarService } from "./stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import {
  mockRequestContextService,
  mockStructuredLogger,
} from "../observability/testing/observability.mock";

describe("HorizonWatcherService cursor persistence", () => {
  let service: HorizonWatcherService;

  const merchantKey =
    "GCZQY7M2K6Z2QG2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2ABCD";

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "stellar") {
        return {
          memoPrefix: "invoisio-",
          sorobanRpcUrl: "",
          sorobanContractId: "",
        };
      }
      if (key === "HORIZON_RETRY_DELAY_MS") return "0";
      return null;
    }),
  };

  const mockStellarService = {
    getMerchantPublicKey: jest.fn().mockReturnValue(merchantKey),
    getServer: jest.fn(),
    getConfig: jest.fn().mockReturnValue({ memoPrefix: "invoisio-" }),
    pingHorizon: jest.fn(),
  };

  const mockSorobanService = {
    recordPayment: jest.fn(),
    getSettlementRefOwner: jest.fn(),
    pingRpc: jest.fn(),
  };

  const applyHorizonPayment = jest.fn();
  const mockInvoicesService = {
    applyHorizonPayment,
    recordAnchoringFailure: jest.fn(),
    updateSorobanMetadata: jest.fn(),
  };

  const cursorFindUnique = jest.fn();
  const cursorUpsert = jest.fn();
  const deadLetterUpsert = jest.fn();
  const mockPrismaService = {
    watcherCursor: {
      findUnique: cursorFindUnique,
      upsert: cursorUpsert,
    },
    watcherDeadLetter: {
      upsert: deadLetterUpsert,
    },
  };

  /** Builds a paginated fake Horizon server for the account's payments.
   *  Each test supplies exactly one page; every poll returns it regardless
   *  of the requested cursor (mocks do not model real pagination). */
  function makeServer(page: Array<Record<string, any>>) {
    return {
      payments: () => ({
        forAccount: () => ({
          cursor: () => ({
            order: () => ({
              limit: () => ({
                call: async () => ({
                  records: page.map((r) => ({ ...r })),
                }),
              }),
            }),
          }),
        }),
      }),
    };
  }

  function makePayment(overrides: Record<string, any> = {}) {
    return {
      id: `payment-${Math.random().toString(36).slice(2, 8)}`,
      type: "payment",
      to: merchantKey,
      from: "GCPAYERADDRESSPAYERADDRESSPAYERADDRESSPAYERADDR1234",
      amount: "25.0000000",
      asset_code: "XLM",
      paging_token: Math.ceil(Math.random() * 1_000_000).toString(),
      transaction_hash: `tx-${Math.random().toString(36).slice(2, 10)}`,
      transaction: async () => ({
        memo: "invoisio-42",
      }),
      ...overrides,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    applyHorizonPayment.mockReset();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === "stellar") {
        return {
          memoPrefix: "invoisio-",
          sorobanRpcUrl: "",
          sorobanContractId: "",
        };
      }
      if (key === "HORIZON_RETRY_DELAY_MS") return "0";
      return null;
    });
    mockStellarService.getMerchantPublicKey.mockReturnValue(merchantKey);
    cursorFindUnique.mockResolvedValue(null);
    cursorUpsert.mockResolvedValue({ updatedAt: new Date() });
    deadLetterUpsert.mockResolvedValue({});
    // Successful processing by default: invoice marked paid.
    applyHorizonPayment.mockResolvedValue({
      invoice: { id: "invoice-1", status: "paid", memo: "42" },
    });
    mockInvoicesService.recordAnchoringFailure.mockResolvedValue(undefined);
    mockSorobanService.getSettlementRefOwner.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonWatcherService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
        { provide: StructuredLogger, useValue: mockStructuredLogger },
      ],
    }).compile();

    service = module.get<HorizonWatcherService>(HorizonWatcherService);
  });

  afterEach(() => {
    service?.onModuleDestroy();
  });

  /** The initial poll on init runs fire-and-forget; wait for it to settle. */
  async function waitFor(predicate: () => boolean, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error("condition not met in time");
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  describe("restart resumption", () => {
    it("resumes from the persisted cursor instead of 'now'", async () => {
      const persistedAt = new Date(Date.now() - 60_000);
      cursorFindUnique.mockResolvedValue({
        watcher: "horizon",
        cursor: "1234567",
        updatedAt: persistedAt,
      });
      // Payments settled during downtime live behind the persisted cursor.
      mockStellarService.getServer.mockReturnValue(makeServer([makePayment()]));

      await service.onModuleInit();

      expect(cursorFindUnique).toHaveBeenCalledWith({
        where: { watcher: "horizon" },
      });
      expect(service.getCursorState()).toEqual({
        watcher: "horizon",
        cursor: "1234567",
        cursorUpdatedAt: persistedAt,
        resumed: true,
      });
    });

    it("falls back to 'now' only on a genuine first run", async () => {
      cursorFindUnique.mockResolvedValue(null);
      mockStellarService.getServer.mockReturnValue(makeServer([]));

      await service.onModuleInit();

      expect(service.getCursorState().cursor).toBe("now");
    });

    it("checkpoints every advanced cursor position", async () => {
      const p1 = makePayment({ paging_token: "100", id: "p-1" });
      const p2 = makePayment({ paging_token: "200", id: "p-2" });
      mockStellarService.getServer.mockReturnValue(makeServer([p1, p2]));

      await service.pollPayments();

      expect(cursorUpsert).toHaveBeenCalledTimes(1);
      expect(cursorUpsert).toHaveBeenCalledWith({
        where: { watcher: "horizon" },
        create: { watcher: "horizon", cursor: "200" },
        update: { cursor: "200" },
      });
      expect(service.getCursorState().cursor).toBe("200");
    });

    it("payments settled while down are picked up after restart", async () => {
      cursorFindUnique.mockResolvedValue({
        watcher: "horizon",
        cursor: "50",
        updatedAt: new Date(),
      });
      const missedPayment = makePayment({ paging_token: "51", id: "missed" });
      mockStellarService.getServer.mockReturnValue(makeServer([missedPayment]));

      await service.onModuleInit();
      await waitFor(() => applyHorizonPayment.mock.calls.length > 0);

      expect(applyHorizonPayment).toHaveBeenCalledTimes(1);
      expect(cursorUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ cursor: "51" }),
        }),
      );
    });
  });

  describe("mid-batch failure handling", () => {
    it("retries a failing payment before dead-lettering it, then keeps consuming", async () => {
      let attempts = 0;
      const poison = makePayment({ paging_token: "300", id: "bad-tx" });
      poison.transaction = async () => {
        attempts += 1;
        throw new Error("db connection lost");
      };
      const following = makePayment({ paging_token: "400", id: "after-bad" });
      mockStellarService.getServer.mockReturnValue(
        makeServer([poison, following]),
      );

      await service.pollPayments();

      // Bounded retry budget respected before quarantine.
      expect(attempts).toBe(3);
      expect(deadLetterUpsert).toHaveBeenCalledTimes(1);
      // Watcher not stalled by the poison record: the next payment in the
      // same batch was still processed and the cursor moved past both.
      expect(applyHorizonPayment).toHaveBeenCalledWith(
        expect.objectContaining({ txHash: following.transaction_hash }),
      );
      expect(service.getCursorState().cursor).toBe("400");
    });

    it("retries a transient failure and succeeds without skipping", async () => {
      let attempts = 0;
      const flaky = makePayment({ paging_token: "500", id: "flaky" });
      flaky.transaction = async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient network blip");
        return { memo: "invoisio-77" };
      };
      mockStellarService.getServer.mockReturnValue(makeServer([flaky]));

      await service.pollPayments();

      expect(attempts).toBe(3);
      expect(applyHorizonPayment).toHaveBeenCalledWith(
        expect.objectContaining({ memo: "77" }),
      );
      expect(deadLetterUpsert).not.toHaveBeenCalled();
      expect(service.getCursorState().cursor).toBe("500");
    });

    it("dead-letters a poison record after exhausting retries and keeps polling", async () => {
      const poison = makePayment({ paging_token: "600", id: "poison" });
      poison.transaction = async () => {
        throw new Error("permanent constraint violation");
      };
      const next = makePayment({ paging_token: "700", id: "after-poison" });
      mockStellarService.getServer.mockReturnValue(makeServer([poison, next]));

      await service.pollPayments();

      expect(deadLetterUpsert).toHaveBeenCalledTimes(1);
      expect(deadLetterUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            watcher_recordId: { watcher: "horizon", recordId: poison.id },
          },
          update: expect.objectContaining({
            lastError: "permanent constraint violation",
            errorCount: { increment: 1 },
          }),
        }),
      );
      // Watcher not stalled: cursor advanced past the dead-lettered record.
      expect(service.getCursorState().cursor).toBe("700");
    });

    it("halts advancement when even the dead-letter write fails", async () => {
      deadLetterUpsert.mockRejectedValue(new Error("database unavailable"));
      const poison = makePayment({ paging_token: "800", id: "poison-db-down" });
      poison.transaction = async () => {
        throw new Error("permanent failure");
      };
      mockStellarService.getServer.mockReturnValue(makeServer([poison]));

      await service.pollPayments();

      // No silent skip: cursor remains where it was before the poison record.
      expect(service.getCursorState().cursor).not.toBe("800");
      expect(cursorUpsert).not.toHaveBeenCalled();
    });
  });

  describe("Soroban anchoring duplicate handling (#495)", () => {
    /** Let the fire-and-forget `.catch()` handler on `anchorToSoroban` settle. */
    async function flushAnchoringCatch() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    }

    it("treats PaymentAlreadyRecorded as a benign retry: no anchoring failure recorded", async () => {
      const payment = makePayment({ paging_token: "900", id: "already-recorded" });
      mockStellarService.getServer.mockReturnValue(makeServer([payment]));
      mockSorobanService.recordPayment.mockRejectedValue(
        new SorobanContractError(
          "PaymentAlreadyRecorded",
          3,
          "Soroban contract error: PaymentAlreadyRecorded (code=3)",
        ),
      );

      await service.pollPayments();
      await waitFor(() => mockSorobanService.recordPayment.mock.calls.length > 0);
      await flushAnchoringCatch();

      expect(mockInvoicesService.recordAnchoringFailure).not.toHaveBeenCalled();
      expect(mockStructuredLogger.info).toHaveBeenCalledWith(
        "horizon.soroban_anchor.duplicate_benign",
        expect.objectContaining({ reason: "invoice_already_recorded" }),
      );
    });

    it("treats SettlementRefAlreadyUsed as benign when the owner is this same invoice", async () => {
      const payment = makePayment({
        paging_token: "901",
        id: "same-invoice-retry",
        transaction_hash: "same-invoice-retry-tx",
      });
      payment.transaction = async () => ({ memo: "invoisio-42" });
      mockStellarService.getServer.mockReturnValue(makeServer([payment]));
      mockSorobanService.recordPayment.mockRejectedValue(
        new SorobanContractError(
          "SettlementRefAlreadyUsed",
          20,
          "Soroban contract error: SettlementRefAlreadyUsed (code=20)",
        ),
      );
      // The invoice's own on-chain ID (`invoice.memo`) already owns this ref.
      mockSorobanService.getSettlementRefOwner.mockResolvedValue("42");

      await service.pollPayments();
      await waitFor(() => mockSorobanService.getSettlementRefOwner.mock.calls.length > 0);
      await flushAnchoringCatch();

      expect(mockSorobanService.getSettlementRefOwner).toHaveBeenCalledWith(
        "same-invoice-retry-tx",
      );
      expect(mockInvoicesService.recordAnchoringFailure).not.toHaveBeenCalled();
      expect(mockStructuredLogger.info).toHaveBeenCalledWith(
        "horizon.soroban_anchor.duplicate_benign",
        expect.objectContaining({
          reason: "settlement_ref_owned_by_same_invoice",
        }),
      );
    });

    it("treats SettlementRefAlreadyUsed as a genuine conflict when a different invoice owns the reference", async () => {
      const payment = makePayment({
        paging_token: "902",
        id: "conflicting-invoice",
        transaction_hash: "conflicting-invoice-tx",
      });
      payment.transaction = async () => ({ memo: "invoisio-42" });
      mockStellarService.getServer.mockReturnValue(makeServer([payment]));
      mockSorobanService.recordPayment.mockRejectedValue(
        new SorobanContractError(
          "SettlementRefAlreadyUsed",
          20,
          "Soroban contract error: SettlementRefAlreadyUsed (code=20)",
        ),
      );
      // A different invoice already claimed this settlement reference.
      mockSorobanService.getSettlementRefOwner.mockResolvedValue("99");

      await service.pollPayments();
      await waitFor(
        () => mockInvoicesService.recordAnchoringFailure.mock.calls.length > 0,
      );
      await flushAnchoringCatch();

      expect(mockInvoicesService.recordAnchoringFailure).toHaveBeenCalledWith(
        "invoice-1",
        "permanent",
      );
      expect(mockStructuredLogger.error).toHaveBeenCalledWith(
        "horizon.soroban_anchor.settlement_ref_conflict",
        expect.objectContaining({
          invoiceId: "invoice-1",
          conflictingInvoiceId: "99",
        }),
      );
    });
  });
});
