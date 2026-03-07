import { Test, TestingModule } from "@nestjs/testing";
import { SorobanEventsService } from "./soroban-events.service";
import { ConfigService } from "@nestjs/config";
import { InvoicesService } from "../invoices/invoices.service";

describe("SorobanEventsService", () => {
  let service: SorobanEventsService;
  const applySpy = jest.fn();

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
      return null;
    }),
  };

  const mockInvoicesService = {
    applySorobanPaymentEvent: applySpy,
  };

  beforeEach(async () => {
    applySpy.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanEventsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: InvoicesService, useValue: mockInvoicesService },
      ],
    }).compile();

    service = module.get<SorobanEventsService>(SorobanEventsService);
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

  it("parses and forwards payment_recorded events", async () => {
    const ev = {
      id: "evt2",
      topic: ["InvoicePaymentRecorded"],
      ledger: 123,
      value: {
        invoice_id: "invoisio-550e8400-e29b-41d4-a716-446655440000",
        payer: "GCBZQY7M2K6Z2QG2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2Z2",
        asset_code: "XLM",
        asset_issuer: "",
        amount: "10000000",
      },
    };
    await service.handleEvent(ev);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt2",
        invoice_id: "invoisio-550e8400-e29b-41d4-a716-446655440000",
        asset_code: "XLM",
        amount: "10000000",
      }),
    );
  });
});
