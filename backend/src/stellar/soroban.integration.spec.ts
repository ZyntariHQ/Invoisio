import { Test, TestingModule } from "@nestjs/testing";
import { HorizonWatcherService } from "./horizon-watcher.service";
import { SorobanService } from "./soroban.service";
import { StellarService } from "./stellar.service";
import { InvoicesService } from "../invoices/invoices.service";
import { ConfigService } from "@nestjs/config";

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
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                HORIZON_POLL_INTERVAL: "1000",
              };
              return config[key];
            }),
          },
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(invoicesService.markAsPaid).toHaveBeenCalledWith(
        mockInvoice.id,
        "horizon-tx-hash-abc",
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sorobanService.recordPayment).toHaveBeenCalledWith({
        invoiceId: mockInvoice.memo,
        payer: mockPaymentRecord.from,
        assetCode: "XLM",
        assetIssuer: "",
        amount: "100000000",
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(invoicesService.updateSorobanMetadata).toHaveBeenCalledWith(
        mockInvoice.id,
        "soroban-tx-hash-xyz",
        "CONTRACT_ID_123",
      );
    });

    it("should continue processing even if Soroban anchoring fails", async () => {
      jest
        .spyOn(invoicesService, "findByMemo")
        .mockResolvedValue(mockInvoice as any);
      jest
        .spyOn(invoicesService, "markAsPaid")
        .mockResolvedValue(mockInvoice as any);
      jest.spyOn(sorobanService, "recordPayment").mockResolvedValue(null);

      await (horizonWatcher as any).processPayment(
        mockPaymentRecord,
        "invoisio-",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(invoicesService.markAsPaid).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sorobanService.recordPayment).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(invoicesService.updateSorobanMetadata).not.toHaveBeenCalled();
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
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
