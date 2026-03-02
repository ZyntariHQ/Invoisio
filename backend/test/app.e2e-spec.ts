import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
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
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
            expect(invoice).toHaveProperty("asset");
            expect(invoice).toHaveProperty("memo");
            expect(invoice).toHaveProperty("status");
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
    it("should create a new invoice", () => {
      const newInvoice = {
        invoiceNumber: "INV-E2E-001",
        clientName: "E2E Test Client",
        clientEmail: "e2e@test.com",
        description: "End-to-end test invoice",
        amount: 999.99,
        asset: "USDC",
      };

      return request(app.getHttpServer())
        .post("/invoices")
        .send(newInvoice)
        .expect(201)
        .expect((res) => {
          expect(res.body.invoiceNumber).toBe(newInvoice.invoiceNumber);
          expect(res.body.clientName).toBe(newInvoice.clientName);
          expect(res.body.amount).toBe(newInvoice.amount);
          expect(res.body.asset).toBe(newInvoice.asset);
          expect(res.body.status).toBe("pending");
          expect(res.body.memo).toContain("invoisio-");
          expect(res.body.id).toBeDefined();
        });
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
