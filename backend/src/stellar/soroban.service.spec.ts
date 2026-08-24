import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Keypair } from "@stellar/stellar-sdk";
import { SorobanContractError } from "@invoisio/soroban-client";
import { SorobanService } from "./soroban.service";
import { SorobanRpcException } from "./exceptions/stellar.exceptions";

const mockServer = {
  getAccount: jest.fn(),
  prepareTransaction: jest.fn(),
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
  getHealth: jest.fn(),
};

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => mockServer),
    },
  };
});

describe("SorobanService", () => {
  let service: SorobanService;

  describe("Configuration", () => {
    it("should return null when contract ID is not configured", async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SorobanService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => ""),
            },
          },
        ],
      }).compile();

      service = module.get<SorobanService>(SorobanService);

      const result = await service.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
        settlementRef: "settle-hash-abc",
      });

      expect(result).toBeNull();
    });

    it("should return null when secret key is not configured", async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SorobanService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === "SOROBAN_CONTRACT_ID") {
                  return "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2";
                }
                return "";
              }),
            },
          },
        ],
      }).compile();

      service = module.get<SorobanService>(SorobanService);

      const result = await service.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
        settlementRef: "settle-hash-abc",
      });

      expect(result).toBeNull();
    });

    it("should be defined with valid configuration", () => {
      const module = Test.createTestingModule({
        providers: [
          SorobanService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const config: Record<string, string> = {
                  SOROBAN_CONTRACT_ID:
                    "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
                  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
                  STELLAR_NETWORK_PASSPHRASE:
                    "Test SDF Network ; September 2015",
                  SOROBAN_SECRET_KEY:
                    "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
                  SOROBAN_MAX_RETRIES: "3",
                  SOROBAN_RETRY_DELAY_MS: "100",
                };
                return config[key];
              }),
            },
          },
        ],
      });

      expect(module).toBeDefined();
    });
  });

  describe("Anchoring failure classification", () => {
    const adminKeypair = Keypair.random();
    const payerKeypair = Keypair.random();

    const buildService = async (
      overrides: Record<string, string> = {},
    ): Promise<SorobanService> => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SorobanService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const config: Record<string, string> = {
                  SOROBAN_CONTRACT_ID:
                    "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
                  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
                  STELLAR_NETWORK_PASSPHRASE:
                    "Test SDF Network ; September 2015",
                  SOROBAN_SECRET_KEY: adminKeypair.secret(),
                  SOROBAN_MAX_RETRIES: "3",
                  SOROBAN_RETRY_DELAY_MS: "1",
                  ...overrides,
                };
                return config[key];
              }),
            },
          },
        ],
      }).compile();

      return module.get<SorobanService>(SorobanService);
    };

    const recordPaymentParams = {
      invoiceId: "invoisio-001",
      payer: payerKeypair.publicKey(),
      assetCode: "XLM",
      assetIssuer: "",
      amount: "10000000",
      settlementRef: "settle-hash-abc",
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockServer.getAccount.mockResolvedValue({
        accountId: () => adminKeypair.publicKey(),
        sequenceNumber: () => "1",
        incrementSequenceNumber: jest.fn(),
      });
    });

    it("throws SorobanContractError immediately without retrying on a permanent contract rejection", async () => {
      service = await buildService();
      mockServer.prepareTransaction.mockRejectedValue(
        new Error("host error: Error(Contract, #3)"),
      );

      await expect(
        service.recordPayment(recordPaymentParams),
      ).rejects.toBeInstanceOf(SorobanContractError);
      await expect(
        service.recordPayment(recordPaymentParams),
      ).rejects.toMatchObject({
        code: "PaymentAlreadyRecorded",
        numericCode: 3,
      });

      // One prepareTransaction call per recordPayment() invocation above —
      // no retry attempts were burned on a rejection that can't succeed.
      expect(mockServer.prepareTransaction).toHaveBeenCalledTimes(2);
    });

    it("retries a transient failure and throws SorobanRpcException once retries are exhausted", async () => {
      service = await buildService({ SOROBAN_MAX_RETRIES: "2" });
      mockServer.prepareTransaction.mockRejectedValue(
        new Error("ECONNRESET: network timeout"),
      );

      await expect(
        service.recordPayment(recordPaymentParams),
      ).rejects.toBeInstanceOf(SorobanRpcException);

      expect(mockServer.prepareTransaction).toHaveBeenCalledTimes(2);
    });

    it("recovers from a transient failure that resolves within the retry budget", async () => {
      service = await buildService({ SOROBAN_MAX_RETRIES: "3" });
      mockServer.prepareTransaction
        .mockRejectedValueOnce(new Error("ECONNRESET: network timeout"))
        .mockImplementationOnce(async (tx: unknown) => tx);
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "soroban-tx-hash",
      });
      mockServer.getTransaction.mockResolvedValue({
        status: "SUCCESS",
        ledger: 12345,
      });

      const result = await service.recordPayment(recordPaymentParams);

      expect(result).toEqual({
        txHash: "soroban-tx-hash",
        contractId: "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
        ledger: 12345,
      });
      expect(mockServer.prepareTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
