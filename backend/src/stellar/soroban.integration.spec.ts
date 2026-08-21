import { Test, TestingModule } from "@nestjs/testing";
import { SorobanContractError } from "@invoisio/soroban-client";
import { HorizonWatcherService } from "./horizon-watcher.service";
import { SorobanService } from "./soroban.service";
import { StellarService } from "./stellar.service";
import { InvoicesService } from "../invoices/invoices.service";
import { SorobanRpcException } from "./exceptions/stellar.exceptions";
import { ConfigService } from "@nestjs/config";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import {
  mockRequestContextService,
  mockStructuredLogger,
} from "../observability/testing/observability.mock";

describe("Soroban Integration", () => {
  let horizonWatcher: HorizonWatcherService;
  let sorobanService: SorobanService;
  let invoicesService: InvoicesService;

  const mockInvoice = {
    id: "invoice-uuid-123",
    memo: "1234567890",
    status: "pending",
    amount: 100,
    asset_code: "XLM",
  };

  const mockPaymentRecord = {
    id: "payment-123",
    transaction_hash: "horizon-tx-hash-abc",
    from: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    to: "MERCHANT_KEY",
    amount: "10.0",
    asset_code: "XLM",
    transaction: jest.fn().mockResolvedValue({ memo: "1234567890" }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonWatcherService,
        {
          provide: SorobanService,
          useValue: {
            recordPayment: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            getMerchantPublicKey: jest.fn().mockReturnValue("MERCHANT_KEY"),
            getServer: jest.fn().mockReturnValue({
              payments: jest.fn().mockReturnThis(),
              forAccount: jest.fn().mockReturnThis(),
              cursor: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              call: jest.fn().mockResolvedValue({ records: [] }),
            }),
            getConfig: jest.fn().mockReturnValue({ memoPrefix: "invoisio-" }),
          },
        },
        {
          provide: InvoicesService,
          useValue: {
            findByMemo: jest.fn(),
            markAsPaid: jest.fn(),
            updateSorobanMetadata: jest.fn(),
            recordAnchoringFailure: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, unknown> = {
                HORIZON_POLL_INTERVAL: "1000",
                "observability.slowNetworkThresholdMs": 500,
              };
              return config[key];
            }),
          },
        },
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

    horizonWatcher = module.get<HorizonWatcherService>(HorizonWatcherService);
    sorobanService = module.get<SorobanService>(SorobanService);
    invoicesService = module.get<InvoicesService>(InvoicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Payment flow with Soroban anchoring", () => {
    it("should anchor payment to Soroban after Horizon confirmation", async () => {
      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(mockInvoice as any);
      jest.spyOn(sorobanService, "recordPayment").mockResolvedValue({
        txHash: "soroban-tx-hash-xyz",
        contractId: "CONTRACT_ID_123",
      });
      jest
        .spyOn(invoicesService, "updateSorobanMetadata")
        .mockResolvedValue(mockInvoice as any);

      await (horizonWatcher as any).processPayment(
        mockPaymentRecord,
        "invoisio-",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(invoicesService.markAsPaid).toHaveBeenCalledWith(
        mockInvoice.id,
        "horizon-tx-hash-abc",
      );

      expect(sorobanService.recordPayment).toHaveBeenCalledWith({
        invoiceId: mockInvoice.memo,
        payer: mockPaymentRecord.from,
        assetCode: "XLM",
        assetIssuer: "",
        amount: "100000000",
        settlementRef: mockPaymentRecord.transaction_hash,
      });

      expect(invoicesService.updateSorobanMetadata).toHaveBeenCalledWith(
        mockInvoice.id,
        "soroban-tx-hash-xyz",
        "CONTRACT_ID_123",
      );
    });

    it("should continue processing when Soroban anchoring is not configured", async () => {
      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(mockInvoice as any);
      // null from recordPayment means "not configured", not "failed" — see
      // SorobanService.recordPayment's doc comment.
      jest.spyOn(sorobanService, "recordPayment").mockResolvedValue(null);

      await (horizonWatcher as any).processPayment(
        mockPaymentRecord,
        "invoisio-",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(invoicesService.markAsPaid).toHaveBeenCalled();
      expect(sorobanService.recordPayment).toHaveBeenCalled();
      expect(invoicesService.updateSorobanMetadata).not.toHaveBeenCalled();
      // Not configured is a no-op, not a failure — nothing should be
      // recorded as a failed anchoring attempt.
      expect(invoicesService.recordAnchoringFailure).not.toHaveBeenCalled();
    });

    it("should surface a permanent contract rejection instead of silently swallowing it", async () => {
      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(sorobanService, "recordPayment")
        .mockRejectedValue(
          new SorobanContractError(
            "PaymentAlreadyRecorded",
            3,
            "Soroban contract error: PaymentAlreadyRecorded (code=3)",
          ),
        );

      await (horizonWatcher as any).processPayment(
        mockPaymentRecord,
        "invoisio-",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // The invoice is still marked paid on Horizon confirmation —
      // anchoring is a downstream concern, not a payment-confirmation gate.
      expect(invoicesService.markAsPaid).toHaveBeenCalled();
      expect(invoicesService.updateSorobanMetadata).not.toHaveBeenCalled();

      // But the failure itself must be visible and actionable, not silent.
      expect(invoicesService.recordAnchoringFailure).toHaveBeenCalledWith(
        mockInvoice.id,
        "permanent",
      );
    });

    it("should surface a transient RPC failure distinctly from a permanent rejection", async () => {
      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(sorobanService, "recordPayment")
        .mockRejectedValue(
          new SorobanRpcException(
            "Soroban record_payment failed after 3 attempts: ECONNRESET",
          ),
        );

      await (horizonWatcher as any).processPayment(
        mockPaymentRecord,
        "invoisio-",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(invoicesService.updateSorobanMetadata).not.toHaveBeenCalled();
      expect(invoicesService.recordAnchoringFailure).toHaveBeenCalledWith(
        mockInvoice.id,
        "transient",
      );
    });

    it("should handle USDC payment with issuer", async () => {
      const usdcPayment = {
        ...mockPaymentRecord,
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const usdcInvoice = { ...mockInvoice, asset_code: "USDC" };

      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(usdcInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(usdcInvoice as any);
      jest.spyOn(sorobanService, "recordPayment").mockResolvedValue({
        txHash: "soroban-usdc-tx",
        contractId: "CONTRACT_ID_123",
      });

      await (horizonWatcher as any).processPayment(usdcPayment, "invoisio-");

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(sorobanService.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          assetCode: "USDC",
          assetIssuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        }),
      );
    });
  });
});
