import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "./invoices.service";
import { ConfigService } from "@nestjs/config";
import { StellarService } from "../stellar/stellar.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { PrismaService } from "../prisma/prisma.service";

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
      .mockReturnValue(
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      ),
  };

  const sampleInvoices = [
    {
      id: "1",
      invoiceNumber: "INV-001",
      clientName: "Acme",
      clientEmail: "a@a.com",
      description: "d",
      amount: 100,
      asset_code: "XLM",
      asset_issuer: null,
      memo: "123",
      memo_type: "ID",
      status: "pending",
      destination_address: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      invoiceNumber: "INV-002",
      clientName: "Acme",
      clientEmail: "b@b.com",
      description: "d",
      amount: 200,
      asset_code: "USDC",
      asset_issuer: "GASDF",
      memo: "456",
      memo_type: "ID",
      status: "paid",
      destination_address: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "3",
      invoiceNumber: "INV-003",
      clientName: "Acme",
      clientEmail: "c@c.com",
      description: "d",
      amount: 300,
      asset_code: "USDC",
      asset_issuer: "GASDF",
      memo: "789",
      memo_type: "ID",
      status: "overdue",
      destination_address: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrisma = () => {
    // create a mutable copy so test operations affect returned values
    const invoices = sampleInvoices.map((i) => ({ ...i }));

    return {
      invoice: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(invoices)),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              invoices.find((i) => i.id === where.id || i.memo === where.memo),
            ),
          ),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const record = { id: String(Math.random()), ...data };
          invoices.unshift(record);
          return Promise.resolve(record);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const idx = invoices.findIndex(
            (i) => i.id === where.id || i.memo === where.memo,
          );
          if (idx === -1) return Promise.resolve(null);
          invoices[idx] = { ...invoices[idx], ...data };
          return Promise.resolve(invoices[idx]);
        }),
        count: jest
          .fn()
          .mockImplementation(() => Promise.resolve(invoices.length)),
        createMany: jest.fn().mockImplementation(({ data }: any) => {
          if (Array.isArray(data)) {
            for (const d of data)
              invoices.unshift({ id: String(Math.random()), ...d });
            return Promise.resolve({ count: data.length });
          }
          return Promise.resolve({ count: 0 });
        }),
      },
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: PrismaService, useFactory: mockPrisma },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return an array of invoices", async () => {
      const result = await service.findAll();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3); // Sample invoices seeded
    });

    it("should return invoices with required fields", async () => {
      const result = await service.findAll();

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
    it("should return a single invoice by id", async () => {
      const allInvoices = await service.findAll();
      const firstInvoice = allInvoices[0];

      const result = await service.findOne(firstInvoice.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(firstInvoice.id);
    });

    it("should throw NotFoundException for non-existent invoice", async () => {
      await expect(service.findOne("non-existent-id")).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("should create a new invoice", async () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-001",
        clientName: "Test Client",
        clientEmail: "test@example.com",
        description: "Test invoice",
        amount: 100.0,
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const result = await service.create(dto);

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

    it("should create an XLM invoice without asset_issuer", async () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-XLM",
        clientName: "XLM Client",
        clientEmail: "xlm@example.com",
        amount: 50.0,
        asset_code: "XLM",
      };

      const result = await service.create(dto);

      expect(result.asset_code).toBe("XLM");
      expect(result.asset_issuer).toBeUndefined();
    });

    it("should generate a unique memo for each invoice", async () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-002",
        clientName: "Another Client",
        clientEmail: "another@example.com",
        amount: 250.0,
        asset_code: "XLM",
      };

      const first = await service.create({
        ...dto,
        invoiceNumber: "INV-MEMO-A",
      });
      const second = await service.create({
        ...dto,
        invoiceNumber: "INV-MEMO-B",
      });

      expect(first.memo).not.toBe(second.memo);
    });

    it("should add created invoice to the list", async () => {
      const initialCount = (await service.findAll()).length;
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-003",
        clientName: "Count Client",
        clientEmail: "count@example.com",
        amount: 250.0,
        asset_code: "XLM",
      };

      await service.create(dto);

      expect((await service.findAll()).length).toBe(initialCount + 1);
    });
  });

  describe("updateStatus", () => {
    it("should update invoice status", async () => {
      const allInvoices = await service.findAll();
      const invoice = allInvoices[0];

      const newStatus = invoice.status === "pending" ? "paid" : "pending";
      const result = await service.updateStatus(invoice.id, newStatus);

      expect(result.status).toBe(newStatus);
    });
  });

  describe("findByMemo", () => {
    it("should find invoice by memo", async () => {
      const allInvoices = await service.findAll();
      const invoice = allInvoices[0];

      const result = await service.findByMemo(invoice.memo);

      expect(result).toBeDefined();
      expect(result?.id).toBe(invoice.id);
    });

    it("should return undefined for non-existent memo", async () => {
      const result = await service.findByMemo("9999999999999");

      expect(result).toBeNull();
    });
  });
});
