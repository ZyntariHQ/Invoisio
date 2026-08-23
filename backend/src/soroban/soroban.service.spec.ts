import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SorobanService } from "./soroban.service";
import { RecordPaymentDto } from "./dto/soroban-payment.dto";

const mockClient = {
  recordPayment: jest.fn(),
  getPayment: jest.fn(),
  hasPayment: jest.fn(),
};

jest.mock("@invoisio/soroban-client", () => {
  const actual = jest.requireActual("@invoisio/soroban-client");
  return {
    ...actual,
    SorobanInvoiceClient: jest.fn().mockImplementation(() => mockClient),
  };
});

const validStellarConfig = {
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
  adminSecretKey: "SA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
  merchantPublicKey: "",
};

const buildService = async (
  stellarConfig: any,
): Promise<SorobanService> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SorobanService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === "stellar") return stellarConfig;
            return undefined;
          }),
        },
      },
    ],
  }).compile();

  return module.get<SorobanService>(SorobanService);
};

const sampleDto: RecordPaymentDto = {
  invoiceId: "invoisio-1",
  payer: "GA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
  assetCode: "USDC",
  assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "1000000",
  settlementRef: "ref-abc",
};

describe("SorobanService — defensive boot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onModuleInit", () => {
    it("initializes the client when admin secret key and contract id are set", async () => {
      const service = await buildService(validStellarConfig);
      service.onModuleInit();
      expect(
        require("@invoisio/soroban-client").SorobanInvoiceClient,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ contractId: validStellarConfig.contractId }),
      );
    });

    it("initializes the client with only a merchant public key", async () => {
      const service = await buildService({
        ...validStellarConfig,
        adminSecretKey: "",
        merchantPublicKey:
          "GA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
      });
      service.onModuleInit();
      expect(
        require("@invoisio/soroban-client").SorobanInvoiceClient,
      ).toHaveBeenCalled();
    });

    it("stays dormant when neither admin secret key nor merchant public key is set", async () => {
      const service = await buildService({
        ...validStellarConfig,
        adminSecretKey: "",
        merchantPublicKey: "",
      });
      service.onModuleInit();
      expect(
        require("@invoisio/soroban-client").SorobanInvoiceClient,
      ).not.toHaveBeenCalled();
    });

    it("stays dormant when contract id is missing even with a key configured", async () => {
      const service = await buildService({
        ...validStellarConfig,
        contractId: "",
      });
      service.onModuleInit();
      expect(
        require("@invoisio/soroban-client").SorobanInvoiceClient,
      ).not.toHaveBeenCalled();
    });

    it("catches construction errors and stays dormant", async () => {
      const { SorobanInvoiceClient } = require("@invoisio/soroban-client");
      (SorobanInvoiceClient as jest.Mock).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const service = await buildService(validStellarConfig);
      service.onModuleInit();
      // Subsequent method calls must treat the service as dormant
      const result = await service.recordInvoicePayment(sampleDto);
      expect(result).toBeNull();
    });
  });

  describe("recordInvoicePayment", () => {
    it("returns null and skips the underlying client when dormant", async () => {
      const service = await buildService({
        ...validStellarConfig,
        adminSecretKey: "",
        merchantPublicKey: "",
      });
      service.onModuleInit();

      const result = await service.recordInvoicePayment(sampleDto);

      expect(result).toBeNull();
      expect(mockClient.recordPayment).not.toHaveBeenCalled();
    });

    it("delegates to the underlying client and returns its result when configured", async () => {
      const service = await buildService(validStellarConfig);
      service.onModuleInit();
      mockClient.recordPayment.mockResolvedValue({ hash: "abc", ledger: 42 });

      const result = await service.recordInvoicePayment(sampleDto);

      expect(result).toEqual({ hash: "abc", ledger: 42 });
      expect(mockClient.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: sampleDto.invoiceId,
          amount: BigInt(sampleDto.amount),
        }),
      );
    });
  });

  describe("getInvoicePayment", () => {
    it("returns null when dormant", async () => {
      const service = await buildService({
        ...validStellarConfig,
        contractId: "",
      });
      service.onModuleInit();

      const result = await service.getInvoicePayment("invoisio-1");

      expect(result).toBeNull();
      expect(mockClient.getPayment).not.toHaveBeenCalled();
    });

    it("returns the record from the underlying client when configured", async () => {
      const service = await buildService(validStellarConfig);
      service.onModuleInit();
      const record = { invoiceId: "invoisio-1", timestamp: BigInt(100) } as any;
      mockClient.getPayment.mockResolvedValue(record);

      const result = await service.getInvoicePayment("invoisio-1");

      expect(result).toBe(record);
    });
  });

  describe("hasInvoicePayment", () => {
    it("returns false when dormant (no underlying call)", async () => {
      const service = await buildService({
        ...validStellarConfig,
        adminSecretKey: "",
        merchantPublicKey: "",
      });
      service.onModuleInit();

      const result = await service.hasInvoicePayment("invoisio-1");

      expect(result).toBe(false);
      expect(mockClient.hasPayment).not.toHaveBeenCalled();
    });

    it("returns the boolean from the underlying client when configured", async () => {
      const service = await buildService(validStellarConfig);
      service.onModuleInit();
      mockClient.hasPayment.mockResolvedValue(true);

      const result = await service.hasInvoicePayment("invoisio-1");

      expect(result).toBe(true);
      expect(mockClient.hasPayment).toHaveBeenCalledWith("invoisio-1");
    });
  });
});
