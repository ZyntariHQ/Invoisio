import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "./invoices.service";
import { ConfigService } from "@nestjs/config";
import { StellarService } from "../stellar/stellar.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";

describe("InvoicesService", () => {
  let service: InvoicesService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "stellar") {
        return {
          merchantPublicKey:
            "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        };
      }
      return null;
    }),
  };

  const mockStellarService = {
    getMerchantPublicKey: jest
      .fn()
      .mockReturnValue("GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return an array of invoices", () => {
      const result = service.findAll();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3); // Sample invoices seeded
    });

    it("should return invoices with required fields", () => {
      const result = service.findAll();

      if (result.length > 0) {
        const invoice = result[0];
        expect(invoice).toHaveProperty("id");
        expect(invoice).toHaveProperty("invoiceNumber");
        expect(invoice).toHaveProperty("clientName");
        expect(invoice).toHaveProperty("amount");
        expect(invoice).toHaveProperty("asset_code");
        expect(invoice).toHaveProperty("memo");
        expect(invoice).toHaveProperty("memo_type", "ID");
        expect(invoice).toHaveProperty("status");
        expect(invoice).toHaveProperty("destination_address");
      }
    });
  });

  describe("findOne", () => {
    it("should return a single invoice by id", () => {
      const allInvoices = service.findAll();
      const firstInvoice = allInvoices[0];

      const result = service.findOne(firstInvoice.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(firstInvoice.id);
    });

    it("should throw NotFoundException for non-existent invoice", () => {
      expect(() => service.findOne("non-existent-id")).toThrow();
    });
  });

  describe("create", () => {
    it("should create a new invoice", () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-001",
        clientName: "Test Client",
        clientEmail: "test@example.com",
        description: "Test invoice",
        amount: 100.0,
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const result = service.create(dto);

      expect(result).toBeDefined();
      expect(result.invoiceNumber).toBe(dto.invoiceNumber);
      expect(result.clientName).toBe(dto.clientName);
      expect(result.amount).toBe(dto.amount);
      expect(result.asset_code).toBe("USDC");
      expect(result.asset_issuer).toBe(dto.asset_issuer);
      expect(result.status).toBe("pending");
      // memo is a numeric uint64 string
      expect(result.memo).toMatch(/^\d+$/);
      expect(result.memo_type).toBe("ID");
      expect(result.destination_address).toBe(
        mockStellarService.getMerchantPublicKey(),
      );
    });

    it("should create an XLM invoice without asset_issuer", () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-XLM",
        clientName: "XLM Client",
        clientEmail: "xlm@example.com",
        amount: 50.0,
        asset_code: "XLM",
      };

      const result = service.create(dto);

      expect(result.asset_code).toBe("XLM");
      expect(result.asset_issuer).toBeUndefined();
    });

    it("should generate a unique memo for each invoice", () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-002",
        clientName: "Another Client",
        clientEmail: "another@example.com",
        amount: 250.0,
        asset_code: "XLM",
      };

      const first = service.create({ ...dto, invoiceNumber: "INV-MEMO-A" });
      const second = service.create({ ...dto, invoiceNumber: "INV-MEMO-B" });

      expect(first.memo).not.toBe(second.memo);
    });

    it("should add created invoice to the list", () => {
      const initialCount = service.findAll().length;

      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-003",
        clientName: "Count Client",
        clientEmail: "count@example.com",
        amount: 250.0,
        asset_code: "XLM",
      };

      service.create(dto);

      expect(service.findAll().length).toBe(initialCount + 1);
    });
  });

  describe("updateStatus", () => {
    it("should update invoice status", () => {
      const allInvoices = service.findAll();
      const invoice = allInvoices[0];

      const newStatus = invoice.status === "pending" ? "paid" : "pending";
      const result = service.updateStatus(invoice.id, newStatus);

      expect(result.status).toBe(newStatus);
    });
  });

  describe("findByMemo", () => {
    it("should find invoice by memo", () => {
      const allInvoices = service.findAll();
      const invoice = allInvoices[0];

      const result = service.findByMemo(invoice.memo);

      expect(result).toBeDefined();
      expect(result?.id).toBe(invoice.id);
    });

    it("should return undefined for non-existent memo", () => {
      const result = service.findByMemo("9999999999999");

      expect(result).toBeUndefined();
    });
  });
});
