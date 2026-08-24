import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SorobanService } from "./soroban.service";

// Mock the SorobanInvoiceClient
jest.mock("@invoisio/soroban-client", () => ({
  SorobanInvoiceClient: jest.fn().mockImplementation(() => ({
    recordPayment: jest.fn().mockResolvedValue({
      txHash: "soroban-tx-hash-123",
      contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    }),
    getPayment: jest.fn().mockResolvedValue({
      invoiceId: "test-123",
      payer: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      amount: "100",
    }),
  })),
}));

describe("SorobanService", () => {
  let service: SorobanService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              sorobanRpcUrl: "https://soroban-testnet.stellar.org",
              networkPassphrase: "Test SDF Network ; September 2015",
              contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
              adminSecretKey: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
              merchantPublicKey: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return readiness status", () => {
    // isReady returns false because onModuleInit hasn't been called with env
    expect(service.isReady()).toBe(false);
  });

  it("should handle recordPayment when not initialized", async () => {
    await expect(
      service.recordPayment({
        invoiceId: "test-123",
        payer: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        assetCode: "XLM",
        assetIssuer: "",
        amount: "100",
        settlementRef: "ref-123",
      })
    ).rejects.toThrow("SorobanService not initialized");
  });

  it("should handle hasInvoicePayment when not initialized", async () => {
    const result = await service.hasInvoicePayment("test-123");
    expect(result).toBe(false);
  });

  it("should handle getInvoicePayment when not initialized", async () => {
    const result = await service.getInvoicePayment("test-123");
    expect(result).toBe(null);
  });

  it("should handle checkRpc when not initialized", async () => {
    const result = await service.checkRpc();
    expect(result.reachable).toBe(false);
    expect(result.error).toBe("Soroban service not initialized");
  });
});
