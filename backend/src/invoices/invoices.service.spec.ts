import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { ConfigService } from "@nestjs/config";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";

describe("InvoicesService", () => {
  let service: InvoicesService;

  // helper to validate DTOs using class-validator and class-transformer
  describe("DTO validation", () => {
    it("should reject invalid invoice DTOs", async () => {
      const invalids = [
        // negative amount
        {
          invoiceNumber: "1",
          clientName: "a",
          clientEmail: "a@a.com",
          amount: -1,
          asset_code: "XLM",
        },
        // invalid asset_code characters
        {
          invoiceNumber: "2",
          clientName: "a",
          clientEmail: "a@a.com",
          amount: 1,
          asset_code: "XLM!",
        },
        // non-XLM asset without issuer
        {
          invoiceNumber: "3",
          clientName: "a",
          clientEmail: "a@a.com",
          amount: 1,
          asset_code: "USDC",
        },
        // invalid issuer format
        {
          invoiceNumber: "4",
          clientName: "a",
          clientEmail: "a@a.com",
          amount: 1,
          asset_code: "USDC",
          asset_issuer: "not-valid",
        },
      ];

      for (const raw of invalids) {
        const dto = plainToInstance(CreateInvoiceDto, raw);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });

    it("should accept a valid dto and uppercase asset_code via transform", async () => {
      const raw = {
        invoiceNumber: "5",
        clientName: "b",
        clientEmail: "b@b.com",
        amount: 10,
        asset_code: "usdc",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };
      const dto = plainToInstance(CreateInvoiceDto, raw);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.asset_code).toBe("USDC");
    });
  });

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

  const mockSorobanService = {
    hasInvoicePayment: jest.fn().mockResolvedValue(false),
    recordInvoicePayment: jest
      .fn()
      .mockResolvedValue({ hash: "mock-hash", ledger: 1 }),
    getInvoicePayment: jest.fn().mockResolvedValue(null),
  };

  const sampleInvoices = [
    {
      id: "1",
      userId: "user-1",
      invoiceNumber: "INV-001",
      clientName: "Acme",
      clientEmail: "a@a.com",
      description: "d",
      amount: 100,
      assetCode: "XLM",
      assetIssuer: null,
      memo: "123",
      memoType: "ID",
      status: "pending",
      destinationAddress: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      userId: "user-1",
      invoiceNumber: "INV-002",
      clientName: "Acme",
      clientEmail: "b@b.com",
      description: "d",
      amount: 200,
      assetCode: "USDC",
      assetIssuer: "GASDF",
      memo: "456",
      memoType: "ID",
      status: "paid",
      destinationAddress: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "3",
      userId: "user-2",
      invoiceNumber: "INV-003",
      clientName: "Acme",
      clientEmail: "c@c.com",
      description: "d",
      amount: 300,
      assetCode: "USDC",
      assetIssuer: "GASDF",
      memo: "789",
      memoType: "ID",
      status: "overdue",
      destinationAddress: mockStellarService.getMerchantPublicKey(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrisma = () => {
    // create a mutable copy so test operations affect returned values
    const invoices = sampleInvoices.map((i) => ({ ...i }));
    const queryRows = invoices
      .filter((inv) => inv.userId === "user-1")
      .map((inv, index) => ({
        ...inv,
        ft_match: index === 0,
        ft_rank: Number((0.9 - index * 0.1).toFixed(2)),
        trigram_rank: Number((0.8 - index * 0.1).toFixed(2)),
      }));

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
      $queryRaw: jest.fn().mockResolvedValue(queryRows),
    };
  };

  const mockWebhooksService = {
    enqueueWebhook: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAll", () => {
    it("should return paginated invoices", async () => {
      const result = await service.findAll();

      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("page", 1);
      expect(result).toHaveProperty("pageSize", 20);
      expect(result).toHaveProperty("hasMore");
    });

    it("should return invoices with required fields within items", async () => {
      const result = await service.findAll();

      if (result.items.length > 0) {
        const invoice = result.items[0];
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
      const paginated = await service.findAll();
      const firstInvoice = paginated.items[0];

      const result = await service.findOne(firstInvoice.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(firstInvoice.id);
    });

    it("should throw NotFoundException for non-existent invoice", async () => {
      await expect(service.findOne("non-existent-id")).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("should normalize asset_code casing even when provided lowercase", async () => {
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-CASE-001",
        clientName: "Case Client",
        clientEmail: "case@example.com",
        amount: 123.0,
        asset_code: "usdc",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const result = await service.create(dto);
      expect(result.asset_code).toBe("USDC");
    });

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
      const initialCount = (await service.findAll()).total;
      const dto: CreateInvoiceDto = {
        invoiceNumber: "INV-TEST-003",
        clientName: "Count Client",
        clientEmail: "count@example.com",
        amount: 250.0,
        asset_code: "XLM",
      };

      await service.create(dto);

      expect((await service.findAll()).total).toBe(initialCount + 1);
    });
  });

  describe("updateStatus", () => {
    it("should update invoice status", async () => {
      const paginated = await service.findAll();
      const invoice = paginated.items[0];

      const newStatus = invoice.status === "pending" ? "paid" : "pending";
      const result = await service.updateStatus(invoice.id, newStatus);

      expect(result.status).toBe(newStatus);
    });
  });

  describe("findByMemo", () => {
    it("should find invoice by memo", async () => {
      const paginated = await service.findAll();
      const invoice = paginated.items[0];

      const result = await service.findByMemo(invoice.memo);

      expect(result).toBeDefined();
      expect(result?.id).toBe(invoice.id);
    });

    it("should return undefined for non-existent memo", async () => {
      const result = await service.findByMemo("9999999999999");

      expect(result).toBeNull();
    });
  });

  describe("searchInvoices", () => {
    it("should return invoices scoped to the merchant", async () => {
      const results = await service.searchInvoices("user-1", "Acme", 25);

      expect(results.length).toBeGreaterThan(0);
      for (const invoice of results) {
        expect(invoice).toHaveProperty("clientName");
        expect(invoice).toHaveProperty("asset_code");
      }
    });

    it("should throw when merchant context is missing", async () => {
      await expect(
        service.searchInvoices(undefined as any, "Acme"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
