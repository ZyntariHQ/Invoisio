import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { AppModule } from "./../src/app.module";
import { PrismaService } from "./../src/prisma/prisma.service";

describe("AppController (e2e)", () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let jwtToken: string;
  let prisma: PrismaService;
  let configService: ConfigService;
  let merchantPublicKey: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";
    // Use a predictable fallback so tests are not coupled to a real Stellar address
    process.env.MERCHANT_PUBLIC_KEY =
      process.env.MERCHANT_PUBLIC_KEY ?? "test-public-key";

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

    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);

    merchantPublicKey =
      configService.get("stellar.merchantPublicKey") ||
      "GBRPYHIL2CI3WHGSUJX2BUXCLODYDQBMZ6RBR44RRY5ZWKZ6CAS3JZXR";

    const jwtService = app.get(JwtService);

    jwtToken = jwtService.sign({
      sub: "e2e-test-user",
      wallet: "GBL3OMX7DTHPBJ7BCIGKCCF5YGFPVX4NWVJ67H6FVVR3F3VJPMLVTDUZ",
    });

    await cleanupInvoices();
  });

  afterEach(async () => {
    await cleanupInvoices();
    await app.close();
  });

  async function cleanupInvoices() {
    try {
      await prisma.invoice.deleteMany({});
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("does not exist")
      ) {
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

  describe("Authentication Flow (Stellar)", () => {
    const keypair = StellarSdk.Keypair.random();
    const publicKey = keypair.publicKey();

    it("should issue a nonce for a public key", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey })
        .expect(200);

      expect(res.body.nonce).toBeDefined();
      expect(typeof res.body.nonce).toBe("string");
      expect(res.body.expiresAt).toBeDefined();
    });

    it("should verify signature and return JWT", async () => {
      const nonceRes = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey })
        .expect(200);

      const nonce = nonceRes.body.nonce;

      const signature = keypair
        .sign(Buffer.from(nonce, "utf-8"))
        .toString("base64");

      const verifyRes = await request(app.getHttpServer())
        .post("/auth/verify")
        .send({ publicKey, signedNonce: signature })
        .expect(200);

      expect(verifyRes.body.accessToken).toBeDefined();

      const meRes = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${verifyRes.body.accessToken}`)
        .expect(200);

      expect(meRes.body.publicKey).toBe(publicKey);
    });

    it("should return 400 for invalid Stellar public key", () => {
      return request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: "not-a-stellar-key" })
        .expect(400);
    });

    it("should return 401 for invalid signature", async () => {
      const nonceRes = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey })
        .expect(200);

      const nonce = nonceRes.body.nonce;

      return request(app.getHttpServer())
        .post("/auth/verify")
        .send({
          publicKey,
          signedNonce: Buffer.from("wrong-signature").toString("base64"),
        })
        .expect(401);
    });
  });

  describe("GET /invoices", () => {
    it("should return empty array initially", () => {
      return request(app.getHttpServer())
        .get("/invoices")
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe("POST /invoices", () => {
    it("should create XLM invoice", async () => {
      const newInvoice = {
        invoiceNumber: `INV-XLM-${Date.now()}`,
        clientName: "Test Client",
        clientEmail: "client@test.com",
        amount: 100,
        asset_code: "XLM",
      };

      const response = await request(app.getHttpServer())
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
          expect(res.body.destination_address).toBe(
            process.env.MERCHANT_PUBLIC_KEY,
          );
          expect(res.body.id).toBeDefined();
        });
    });

    it("should create USDC invoice", async () => {
      const usdcIssuer =
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

      const newInvoice = {
        invoiceNumber: `INV-USDC-${Date.now()}`,
        clientName: "USDC Client",
        clientEmail: "usdc@test.com",
        amount: 500,
        asset_code: "USDC",
        asset_issuer: usdcIssuer,
      };

      const response = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      expect(response.body.asset_code).toBe("USDC");
      expect(response.body.asset_issuer).toBe(usdcIssuer);
    });
  });

  describe("PATCH /invoices/:id/status", () => {
    it("should update invoice status", async () => {
      const invoice = {
        invoiceNumber: `INV-STATUS-${Date.now()}`,
        clientName: "Status Client",
        clientEmail: "status@test.com",
        amount: 50,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoice)
        .expect(201);

      const id = createRes.body.id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/invoices/${id}/status`)
        .send({ status: "paid" })
        .expect(200);

      expect(updateRes.body.status).toBe("paid");
    });
  });

  describe("Input Validation", () => {
    it("should reject negative amount", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BAD",
          clientName: "Bad Client",
          clientEmail: "bad@test.com",
          amount: -10,
          asset_code: "XLM",
        })
        .expect(400);
    });

    it("should reject invalid email", () => {
      return request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({
          invoiceNumber: "INV-BADMAIL",
          clientName: "Bad Email",
          clientEmail: "invalid-email",
          amount: 10,
          asset_code: "XLM",
        })
        .expect(400);
    });
  });

  describe("Full Lifecycle", () => {
    it("create → fetch → update", async () => {
      const newInvoice = {
        invoiceNumber: `INV-FULL-${Date.now()}`,
        clientName: "Lifecycle",
        clientEmail: "life@test.com",
        amount: 200,
        asset_code: "XLM",
      };

      const createRes = await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(newInvoice)
        .expect(201);

      const id = createRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/invoices/${id}`)
        .expect(200);

      expect(getRes.body.id).toBe(id);

      await request(app.getHttpServer())
        .patch(`/invoices/${id}/status`)
        .send({ status: "paid" })
        .expect(200);

      const final = await request(app.getHttpServer())
        .get(`/invoices/${id}`)
        .expect(200);

      expect(final.body.status).toBe("paid");
    });
  });
});
