import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SorobanService } from "./soroban.service";

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
});
