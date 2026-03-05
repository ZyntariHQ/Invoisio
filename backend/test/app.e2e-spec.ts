import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";

/**
 * End-to-end tests for the Invoisio Backend API
 *
 * Tests:
 * - Health check endpoint
 * - Invoices API endpoints with full flow coverage
 * - Auth guard with JWT validation
 * - Database isolation with fresh state per test
 * - MERCHANT_PUBLIC_KEY configuration with fallback
 */
describe("AppController (e2e)", () => {
  // Extend default Jest timeout for slow CI environments
  jest.setTimeout(30000);
  let app: INestApplication;
  let jwtToken: string;
  let prisma: PrismaService;
  let configService: ConfigService;
  let merchantPublicKey: string;

  beforeAll(async () => {
    // Set JWT secret before module creation
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

    // Set MERCHANT_PUBLIC_KEY for tests, with fallback to test value
    process.env.MERCHANT_PUBLIC_KEY =
      process.env.MERCHANT_PUBLIC_KEY ||
      "GBRPYHIL2CI3WHGSUJX2BUXCLODYDQBMZ6RBR44RRY5ZWKZ6CAS3JZXR";
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    await app.init();

    // Get services for test use
    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);
    merchantPublicKey = configService.get("stellar.merchantPublicKey") || "GBRPYHIL2CI3WHGSUJX2BUXCLODYDQBMZ6RBR44RRY5ZWKZ6CAS3JZXR";

    // Generate a valid JWT for protected endpoints (simulating SIWS JWT)
    const jwtService = app.get(JwtService);
    jwtToken = jwtService.sign({
      sub: "e2e-test-user",
      wallet: "GBL3OMX7DTHPBJ7BCIGKCCF5YGFPVX4NWVJ67H6FVVR3F3VJPMLVTDUZ",
    });

    // Clean up invoices table before each test for isolation
    await cleanupInvoices();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupInvoices();
    await app.close();
  });

  /**
   * Helper function to delete all invoices from the database
   * Ensures test isolation by resetting DB state
   */
  async function cleanupInvoices() {
    try {
      await prisma.invoice.deleteMany({});
    } catch (error) {
      // Silently handle if table doesn't exist or already empty
      if (!error.message.includes("does not exist")) {
        console.error("Cleanup error:", error);
      }
    }
  }

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
    it("should return 200 with empty array after cleanup", () => {
      return request(app.getHttpServer())
        .get("/invoices")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe("GET /invoices/:id", () => {
    it("should return a single invoice by id", async () => {
      // Create an invoice first
      const newInvoice = {
        invoiceNumber: "INV-SINGULAR-TEST",
        clientName: "Singular Test Client",
        clientEmail: "singular@test.com",
        amount: 100.0,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoiceId = createRes.body.id;

      return request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(invoiceId);
          expect(res.body.invoiceNumber).toBe(newInvoice.invoiceNumber);
        });
    });

    it("should return 404 for non-existent invoice", () => {
      return request(app.getHttpServer())
        .get("/invoices/non-existent-id")
        .expect(404);
    });
  });

  describe("POST /invoices - Auth Guard with JWT", () => {
    it("should return 401 when no Authorization header is provided", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .send({
          invoiceNumber: "INV-NO-AUTH",
          clientName: "No Auth Client",
          clientEmail: "noauth@test.com",
          amount: 10.0,
          asset_code: "XLM",
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain("No token provided");
        });
    });

    it("should return 401 when Bearer token is missing", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", "InvalidFormat token123")
        .send({
          invoiceNumber: "INV-BAD-FORMAT",
          clientName: "Bad Format Client",
          clientEmail: "badformat@test.com",
          amount: 10.0,
          asset_code: "XLM",
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain("No token provided");
        });
    });

    it("should return 401 when JWT token is invalid", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", "Bearer invalid.jwt.token")
        .send({
          invoiceNumber: "INV-INVALID-JWT",
          clientName: "Invalid JWT Client",
          clientEmail: "invalidjwt@test.com",
          amount: 10.0,
          asset_code: "XLM",
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain("Invalid or expired token");
        });
    });

    it("should return 401 when JWT token is expired", async () => {
      const jwtService = app.get(JwtService);
      // Generate an expired token (negative expiresIn)
      const expiredToken = jwtService.sign(
        { sub: "e2e-test-user" },
        { expiresIn: "-1s" },
      );

      // Wait a moment to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${expiredToken}`)
        .send({
          invoiceNumber: "INV-EXPIRED-JWT",
          clientName: "Expired JWT Client",
          clientEmail: "expiredjwt@test.com",
          amount: 10.0,
          asset_code: "XLM",
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain("Invalid or expired token");
        });
    });
  });

  describe("POST /invoices - Invoice Creation & Full Flow", () => {
    it("should create XLM invoice and verify destination_address and memo", async () => {
      const newInvoice = {
        invoiceNumber: `INV-XLM-${Date.now()}`,
        clientName: "XLM Test Client",
        clientEmail: "xlm@test.com",
        description: "Testing XLM invoice creation",
        amount: 100.5,
        asset_code: "XLM",
      };

      const response = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoice = response.body;

      // Verify all required fields are present
      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toBe(newInvoice.invoiceNumber);
      expect(invoice.clientName).toBe(newInvoice.clientName);
      expect(invoice.clientEmail).toBe(newInvoice.clientEmail);
      expect(invoice.amount).toBe(newInvoice.amount);
      expect(invoice.asset_code).toBe("XLM");
      expect(invoice.asset_issuer).toBeUndefined();
      expect(invoice.status).toBe("pending");

      // Verify memo is a numeric ID (as per Stellar requirements)
      expect(invoice.memo).toMatch(/^\d+$/);
      expect(invoice.memo.length).toBeGreaterThan(0);
      expect(invoice.memo_type).toBe("ID");

      // Verify destination_address is set to MERCHANT_PUBLIC_KEY
      expect(invoice.destination_address).toBe(merchantPublicKey);
      expect(invoice.destination_address).toMatch(/^G[A-Z2-7]{55}$/);

      // Verify timestamps
      expect(invoice.createdAt).toBeDefined();
      expect(invoice.updatedAt).toBeDefined();
    });

    it("should create USDC invoice with asset_issuer", async () => {
      const usdcIssuer =
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
      const newInvoice = {
        invoiceNumber: `INV-USDC-${Date.now()}`,
        clientName: "USDC Test Client",
        clientEmail: "usdc@test.com",
        amount: 500.0,
        asset_code: "USDC",
        asset_issuer: usdcIssuer,
      };

      const response = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoice = response.body;

      expect(invoice.asset_code).toBe("USDC");
      expect(invoice.asset_issuer).toBe(usdcIssuer);
      expect(invoice.destination_address).toBe(merchantPublicKey);
      expect(invoice.memo).toMatch(/^\d+$/);
    });

    it("should normalize lowercase asset_code", async () => {
      const newInvoice = {
        invoiceNumber: `INV-LOWER-${Date.now()}`,
        clientName: "Lowercase Client",
        clientEmail: "lower@test.com",
        amount: 250.0,
        asset_code: "usdc",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const response = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      expect(response.body.asset_code).toBe("USDC");
    });
  });

  describe("PATCH /invoices/:id/status - Status Update Flow", () => {
    it("should update invoice status from pending to paid", async () => {
      // Create an invoice first
      const newInvoice = {
        invoiceNumber: `INV-STATUS-UPDATE-${Date.now()}`,
        clientName: "Status Update Client",
        clientEmail: "statusupdate@test.com",
        amount: 150.0,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoiceId = createRes.body.id;
      const originalStatus = createRes.body.status;
      expect(originalStatus).toBe("pending");

      // Update status to paid
      const updateRes = await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/status`)
        .send({ status: "paid" })
        .expect(200);

      const updatedInvoice = updateRes.body;
      expect(updatedInvoice.id).toBe(invoiceId);
      expect(updatedInvoice.status).toBe("paid");
      expect(updatedInvoice.invoiceNumber).toBe(newInvoice.invoiceNumber);
      expect(updatedInvoice.amount).toBe(newInvoice.amount);
    });

    it("should verify status persists in database after update", async () => {
      // Create invoice
      const newInvoice = {
        invoiceNumber: `INV-PERSIST-${Date.now()}`,
        clientName: "Persist Client",
        clientEmail: "persist@test.com",
        amount: 200.0,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoiceId = createRes.body.id;

      // Update status
      await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/status`)
        .send({ status: "paid" })
        .expect(200);

      // Fetch invoice again and verify status is persisted
      const getRes = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .expect(200);

      expect(getRes.body.status).toBe("paid");
      expect(getRes.body.id).toBe(invoiceId);
    });

    it("should support toggling between pending and cancelled status", async () => {
      const newInvoice = {
        invoiceNumber: `INV-TOGGLE-${Date.now()}`,
        clientName: "Toggle Client",
        clientEmail: "toggle@test.com",
        amount: 75.0,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoiceId = createRes.body.id;

      // Change to cancelled
      const cancelRes = await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/status`)
        .send({ status: "cancelled" })
        .expect(200);

      expect(cancelRes.body.status).toBe("cancelled");

      // Change back to pending
      const pendingRes = await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/status`)
        .send({ status: "pending" })
        .expect(200);

      expect(pendingRes.body.status).toBe("pending");
    });
  });

  describe("MERCHANT_PUBLIC_KEY Configuration", () => {
    it("should have MERCHANT_PUBLIC_KEY set with fallback value", () => {
      expect(merchantPublicKey).toBeDefined();
      expect(merchantPublicKey.length).toBeGreaterThan(0);
      expect(merchantPublicKey).toMatch(/^G[A-Z2-7]{55}$/);
    });

    it("should use MERCHANT_PUBLIC_KEY in created invoices as destination_address", async () => {
      const newInvoice = {
        invoiceNumber: `INV-MERCHANT-KEY-${Date.now()}`,
        clientName: "Merchant Key Test",
        clientEmail: "merchantkey@test.com",
        amount: 50.0,
        asset_code: "XLM",
      };

      const response = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      expect(response.body.destination_address).toBe(merchantPublicKey);
    });
  });

  describe("Database Isolation - Fresh State Per Test", () => {
    it("should have isolated test data - first invoice", async () => {
      const invoices = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      // After cleanup, should start fresh
      expect(invoices.body.length).toBe(0);
    });

    it("should have isolated test data - second invoice", async () => {
      const invoices = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      // Should still be empty - each test starts fresh
      expect(invoices.body.length).toBe(0);

      // Create an invoice
      const newInvoice = {
        invoiceNumber: `INV-ISOLATION-${Date.now()}`,
        clientName: "Isolation Test",
        clientEmail: "isolation@test.com",
        amount: 100.0,
        asset_code: "XLM",
      };

      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      // Get all and verify only this one exists
      const invoicesAfter = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      expect(invoicesAfter.body.length).toBe(1);
    });
  });

  describe("Input Validation", () => {
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

    it("should return 400 for zero amount", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-ZERO",
          clientName: "Zero Client",
          clientEmail: "zero@test.com",
          amount: 0,
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
          invoiceNumber: "INV-NO-ISSUER",
          clientName: "No Issuer Client",
          clientEmail: "noissuer@test.com",
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

    it("should return 400 for invalid email format", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BAD-EMAIL",
          clientName: "Bad Email Client",
          clientEmail: "not-an-email",
          amount: 100.0,
          asset_code: "XLM",
        })
        .expect(400);
    });

    it("should return 400 for missing required fields", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-MISSING",
          // clientName intentionally omitted
          clientEmail: "missing@test.com",
          amount: 100.0,
          asset_code: "XLM",
        })
        .expect(400);
    });
  });

  describe("Full E2E Flow - Complete Invoice Lifecycle", () => {
    it("should complete full invoice lifecycle: create → fetch → update status", async () => {
      // 1. Create invoice
      const newInvoice = {
        invoiceNumber: `INV-LIFECYCLE-${Date.now()}`,
        clientName: "Lifecycle Test",
        clientEmail: "lifecycle@test.com",
        description: "Full lifecycle test",
        amount: 999.99,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const invoice = createRes.body;
      const invoiceId = invoice.id;

      // Verify creation response
      expect(invoice.id).toBeDefined();
      expect(invoice.status).toBe("pending");
      expect(invoice.destination_address).toBe(merchantPublicKey);
      expect(invoice.memo).toMatch(/^\d+$/);

      // 2. Fetch invoice
      const getRes = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .expect(200);

      const fetchedInvoice = getRes.body;
      expect(fetchedInvoice.id).toBe(invoiceId);
      expect(fetchedInvoice.invoiceNumber).toBe(newInvoice.invoiceNumber);
      expect(fetchedInvoice.status).toBe("pending");

      // 3. Update status to paid
      const updateRes = await request(app.getHttpServer())
        .patch(`/invoices/${invoiceId}/status`)
        .send({ status: "paid" })
        .expect(200);

      const updatedInvoice = updateRes.body;
      expect(updatedInvoice.status).toBe("paid");
      expect(updatedInvoice.id).toBe(invoiceId);

      // 4. Verify status persisted
      const finalRes = await request(app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .expect(200);

      expect(finalRes.body.status).toBe("paid");
      expect(finalRes.body.memo).toBe(invoice.memo);
      expect(finalRes.body.destination_address).toBe(merchantPublicKey);
    });

    it("should handle multiple invoices with independent states", async () => {
      // Create first invoice
      const invoice1Data = {
        invoiceNumber: `INV-MULTI-1-${Date.now()}`,
        clientName: "Client 1",
        clientEmail: "client1@test.com",
        amount: 100.0,
        asset_code: "XLM",
      };

      const res1 = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoice1Data)
        .expect(201);

      const invoice1Id = res1.body.id;

      // Create second invoice
      const invoice2Data = {
        invoiceNumber: `INV-MULTI-2-${Date.now()}`,
        clientName: "Client 2",
        clientEmail: "client2@test.com",
        amount: 200.0,
        asset_code: "USDC",
        asset_issuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      };

      const res2 = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoice2Data)
        .expect(201);

      const invoice2Id = res2.body.id;

      // Update first invoice to paid
      await request(app.getHttpServer())
        .patch(`/invoices/${invoice1Id}/status`)
        .send({ status: "paid" })
        .expect(200);

      // Verify first is paid, second is still pending
      const inv1 = await request(app.getHttpServer())
        .get(`/invoices/${invoice1Id}`)
        .expect(200);

      const inv2 = await request(app.getHttpServer())
        .get(`/invoices/${invoice2Id}`)
        .expect(200);

      expect(inv1.body.status).toBe("paid");
      expect(inv2.body.status).toBe("pending");
      expect(inv1.body.asset_code).toBe("XLM");
      expect(inv2.body.asset_code).toBe("USDC");

      // Verify both appear in list
      const allRes = await request(app.getHttpServer())
        .get("/invoices")
        .expect(200);

      expect(allRes.body.length).toBe(2);
    });
  });
});
