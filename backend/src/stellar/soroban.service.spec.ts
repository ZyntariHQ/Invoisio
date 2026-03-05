import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SorobanService } from "./soroban.service";
import { exec } from "child_process";

jest.mock("child_process");

describe("SorobanService", () => {
  let service: SorobanService;
  let configService: ConfigService;

  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(async () => {
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
                STELLAR_NETWORK: "testnet",
                SOROBAN_IDENTITY: "invoisio-admin",
                SOROBAN_MAX_RETRIES: "3",
                SOROBAN_RETRY_DELAY_MS: "100",
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("recordPayment", () => {
    it("should successfully record payment and return metadata", async () => {
      const mockTxHash =
        "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

      mockExec.mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockTxHash, stderr: "" });
        return {} as any;
      });

      const result = await service.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
      });

      expect(result).toEqual({
        txHash: mockTxHash,
        contractId: "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
      });
    });

    it("should return null when contract ID is not configured", async () => {
      jest.spyOn(configService, "get").mockReturnValue("");

      const newService = new SorobanService(configService);

      const result = await newService.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
      });

      expect(result).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("should retry on failure and eventually succeed", async () => {
      const mockTxHash =
        "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

      let callCount = 0;
      mockExec.mockImplementation((cmd, callback: any) => {
        callCount++;
        if (callCount < 2) {
          callback(new Error("Network error"), { stdout: "", stderr: "" });
        } else {
          callback(null, { stdout: mockTxHash, stderr: "" });
        }
        return {} as any;
      });

      const result = await service.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
      });

      expect(result).toEqual({
        txHash: mockTxHash,
        contractId: "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
      });
      expect(callCount).toBe(2);
    });

    it("should return null after max retries", async () => {
      mockExec.mockImplementation((cmd, callback: any) => {
        callback(new Error("Persistent error"), { stdout: "", stderr: "" });
        return {} as any;
      });

      const result = await service.recordPayment({
        invoiceId: "invoisio-001",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "10000000",
      });

      expect(result).toBeNull();
      expect(mockExec).toHaveBeenCalledTimes(3);
    });

    it("should handle USDC payment with issuer", async () => {
      const mockTxHash =
        "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";

      mockExec.mockImplementation((cmd, callback: any) => {
        expect(cmd).toContain("--asset_code USDC");
        expect(cmd).toContain(
          '--asset_issuer "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"',
        );
        callback(null, { stdout: mockTxHash, stderr: "" });
        return {} as any;
      });

      const result = await service.recordPayment({
        invoiceId: "invoisio-002",
        payer: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "USDC",
        assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "50000000",
      });

      expect(result).toEqual({
        txHash: mockTxHash,
        contractId: "CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2",
      });
    });
  });
});
