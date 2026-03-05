import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AppModule } from "./../src/app.module";

/**
 * End-to-end tests for the Invoisio Backend API
 *
 * Tests:
 * - Health check endpoint
 * - Invoices API endpoints
 */
describe("AppController (e2e)", () => {
  // Extend default Jest timeout for slow CI environments
  jest.setTimeout(30000);
  let app: INestApplication;
  let jwtToken: string;

  beforeEach(async () => {
    // Ensure a secret is available for JwtModule.registerAsync before the module compiles
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    await app.init();

    // Generate a valid JWT for protected endpoints
    const jwtService = app.get(JwtService);
    jwtToken = jwtService.sign({ sub: "e2e-test-user" });
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("should return 200 with health status", () => {
      return request(app.getHttpServer())
        .get("/health")
        .expect(200)
        .expect((res) => {
          expect(res.body.ok).toBe(true);
          expect(res.body.version).toBeDefined();
          expect(res.body.network).toBeDefined();
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  describe("GET /invoices", () => {
    it("should return 200 with array of invoices", () => {
      return request(app.getHttpServer())
        .get("/invoices")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(3);

          // Check first invoice has required fields
          if (res.body.length > 0) {
            const invoice = res.body[0];
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
  });

  describe("GET /invoices/:id", () => {
    it("should return a single invoice by id", async () => {
      // First get all invoices to find a valid ID
      const allInvoices = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      const firstInvoice = allInvoices.body[0];

      return request(app.getHttpServer())
        .get(`/invoices/${firstInvoice.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(firstInvoice.id);
          expect(res.body.invoiceNumber).toBe(firstInvoice.invoiceNumber);
        });
    });

    it("should return 404 for non-existent invoice", () => {
      return request(app.getHttpServer())
        .get("/invoices/non-existent-id")
        .expect(404);
    });
  });

  describe("POST /invoices", () => {
    it("should return 401 when no token is provided", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .send({
          invoiceNumber: "INV-UNAUTH",
          clientName: "No Auth",
          clientEmail: "noauth@test.com",
          amount: 10.0,
          asset_code: "XLM",
        })
        .expect(401);
    });

    it("should create a new XLM invoice", () => {
      const newInvoice = {
        invoiceNumber: "INV-E2E-XLM",
        clientName: "E2E Test Client",
        clientEmail: "e2e@test.com",
        description: "End-to-end test invoice",
        amount: 999.99,
        asset_code: "XLM",
      };

      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201)
        .expect((res) => {
          expect(res.body.invoiceNumber).toBe(newInvoice.invoiceNumber);
          expect(res.body.clientName).toBe(newInvoice.clientName);
          expect(res.body.amount).toBe(newInvoice.amount);
          expect(res.body.asset_code).toBe("XLM");
          expect(res.body.asset_issuer).toBeUndefined();
          expect(res.body.status).toBe("pending");
          expect(res.body.memo).toMatch(/^\d+$/);
          expect(res.body.memo_type).toBe("ID");
          expect(res.body.destination_address).toBeDefined();
          expect(res.body.id).toBeDefined();
        });
    });

    it("should create a new USDC invoice", () => {
      const newInvoice = {
        invoiceNumber: "INV-E2E-USDC",
        clientName: "E2E USDC Client",
        clientEmail: "usdc@test.com",
        amount: 500.0,
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201)
        .expect((res) => {
          expect(res.body.asset_code).toBe("USDC");
          expect(res.body.asset_issuer).toBe(newInvoice.asset_issuer);
        });
    });

    it("should normalize lowercase asset_code in request", () => {
      const newInvoice = {
        invoiceNumber: "INV-E2E-CASE",
        clientName: "Case Client",
        clientEmail: "case@test.com",
        amount: 42.0,
        asset_code: "usdc",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201)
        .expect((res) => {
          expect(res.body.asset_code).toBe("USDC");
        });
    });

    it("should return 400 for negative amount", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-NEG",
          clientName: "Neg Client",
          clientEmail: "neg@test.com",
          amount: -5,
          asset_code: "XLM",
        })
        .expect(400);
    });

    it("should return 400 for non-alphanumeric asset_code", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BADCODE",
          clientName: "BadCode",
          clientEmail: "badcode@test.com",
          amount: 10,
          asset_code: "USDC$",
        })
        .expect(400);
    });

    it("should return 400 when asset_issuer is missing for non-XLM asset", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BAD",
          clientName: "Bad Client",
          clientEmail: "bad@test.com",
          amount: 100.0,
          asset_code: "USDC",
          // asset_issuer intentionally omitted
        })
        .expect(400);
    });

    it("should return 400 when asset_issuer is not a valid Stellar address", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BAD-ISSUER",
          clientName: "Bad Issuer Client",
          clientEmail: "badissuer@test.com",
          amount: 100.0,
          asset_code: "USDC",
          asset_issuer: "not-a-stellar-address",
        })
        .expect(400);
    });
  });

  describe("PATCH /invoices/:id/status", () => {
    it("should update invoice status", async () => {
      // First get all invoices to find a valid ID
      const allInvoices = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      const firstInvoice = allInvoices.body[0];
      const newStatus = firstInvoice.status === "pending" ? "paid" : "pending";

      return request(app.getHttpServer())
        .patch(`/invoices/${firstInvoice.id}/status`)
        .send({ status: newStatus })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(firstInvoice.id);
          expect(res.body.status).toBe(newStatus);
        });
    });
  });
});
