import { Keypair } from "@stellar/stellar-sdk";
import { PrismaService } from "../src/prisma/prisma.service";
import { InvoicesService } from "../src/invoices/invoices.service";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AppModule } from "./../src/app.module";

/**
 * End-to-end tests for Rate Limiting functionality
 *
 * Tests:
 * - Auth endpoints rate limiting (5 requests per 15 minutes)
 * - Invoice creation rate limiting (20 requests per hour per user)
 * - CSV import rate limiting (3 requests per hour per user)
 * - Engagement endpoint rate limiting (30 requests per minute per IP)
 * - 429 responses with Retry-After headers
 * - Guard removal causes tests to fail
 *
 * Note: These tests require database and Redis setup.
 */
describe("Rate Limiting (e2e)", () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let jwtToken: string;

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";

    // Set Redis configuration for testing
    process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
    process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
    process.env.REDIS_DB = "1"; // Use separate DB for tests
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.JWT_SECRET =
      "e2e-test-secret-must-be-long-enough-32-chars-long";
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    const prisma = app.get(PrismaService);

    global.mockDb = global.mockDb || { users: {} };

    jest.spyOn(prisma.user, "findUnique").mockImplementation((async (
      args: any,
    ) => {
      const key = args.where.publicKey || args.where.id;
      return global.mockDb.users[key] || null;
    }) as any);

    jest.spyOn(prisma.user, "create").mockImplementation((async (args: any) => {
      const u = {
        ...args.data,
        id: "u-" + args.data.publicKey,
        tokenVersion: 1,
      };
      global.mockDb.users[args.data.publicKey] = u;
      global.mockDb.users[u.id] = u;
      return u;
    }) as any);

    jest.spyOn(prisma.user, "update").mockImplementation((async (args: any) => {
      const key = args.where.publicKey || args.where.id;
      const u = global.mockDb.users[key];
      if (u) {
        const oldNonce = u.nonce;
        const oldNonceExpiresAt = u.nonceExpiresAt;
        Object.assign(u, args.data);
        if (args.data.nonce === null) {
          u.nonce = oldNonce;
          u.nonceExpiresAt = oldNonceExpiresAt;
          u.nonceUsedAt = null;
        }
      }
      return u;
    }) as any);

    jest
      .spyOn(prisma.merchant, "upsert")
      .mockImplementation((async () => ({})) as any);
    jest
      .spyOn(prisma.merchant, "create")
      .mockImplementation((async () => ({})) as any);

    const inv = app.get(InvoicesService);
    jest
      .spyOn(inv, "create")
      .mockImplementation((async () => ({ id: "inv-1" })) as any);

    // Generate a valid JWT for protected endpoints
    const jwtService = app.get(JwtService);
    jwtToken = jwtService.sign({ sub: "e2e-test-user", tokenVersion: 1 });
    global.mockDb.users["e2e-test-user"] = {
      id: "e2e-test-user",
      merchantId: "m-1",
      tokenVersion: 1,
    };
  });

  afterEach(async () => {
    await app.close();
  });

  describe("Auth endpoints rate limiting", () => {
    const kp = Keypair.random();
    const testPublicKey = kp.publicKey();

    it("should allow first 5 requests to /auth/nonce", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey })
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty("nonce");
            expect(res.body).toHaveProperty("expiresAt");
          });
      }
    });

    it("should return 429 on 6th request to /auth/nonce", async () => {
      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey })
          .expect(200);
      }

      // 6th request should be rate limited
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("error");
          expect(res.body.error).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });

    it("should allow first 5 requests to /auth/verify", async () => {
      // First get a nonce
      const nonceResponse = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(200);

      const { nonce } = nonceResponse.body;

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/verify")
          .send({
            publicKey: testPublicKey,
            signedNonce: kp
              .sign(Buffer.from(nonce, "utf-8"))
              .toString("base64"),
            nonce: nonce,
          })
          .expect(200); // Will fail signature verification but shouldn't be rate limited
      }
    });

    it("should return 429 on 6th request to /auth/verify", async () => {
      // First get a nonce
      const nonceResponse = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(200);

      const { nonce } = nonceResponse.body;

      // Make 5 requests (they will fail signature verification but count toward rate limit)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/verify")
          .send({
            publicKey: testPublicKey,
            signedNonce: kp
              .sign(Buffer.from(nonce, "utf-8"))
              .toString("base64"),
            nonce: nonce,
          })
          .expect(200);
      }

      // 6th request should be rate limited
      await request(app.getHttpServer())
        .post("/auth/verify")
        .send({
          publicKey: testPublicKey,
          signedNonce: kp.sign(Buffer.from(nonce, "utf-8")).toString("base64"),
          nonce: nonce,
        })
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("error");
          expect(res.body.error).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });
  });

  describe("Invoice creation rate limiting", () => {
    const invoiceData = {
      invoiceNumber: "INV-123",
      clientName: "Test Client",
      clientEmail: "test@example.com",
      amount: 100,
      asset_code: "XLM",
      description: "Test invoice",
    };

    it("should allow first 20 invoice creation requests", async () => {
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${jwtToken}`)
          .send(invoiceData)
          .expect(201); // Will likely fail due to missing dependencies but shouldn't be rate limited
      }
    });

    it("should return 429 on 21st invoice creation request", async () => {
      // Make 20 requests
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${jwtToken}`)
          .send(invoiceData)
          .expect(201);
      }

      // 21st request should be rate limited
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoiceData)
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("error");
          expect(res.body.error).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });

    it("should not rate limit different users", async () => {
      // Create JWT for a different user
      const jwtService = app.get(JwtService);
      const differentJwtToken = jwtService.sign({
        sub: "different-test-user",
        tokenVersion: 1,
      });
      global.mockDb.users["different-test-user"] = {
        id: "different-test-user",
        merchantId: "m-2",
        tokenVersion: 1,
      };

      // Make 20 requests with first user
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${jwtToken}`)
          .send(invoiceData)
          .expect(201);
      }

      // 21st request with first user should be rate limited
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoiceData)
        .expect(429);

      // Request with different user should still work
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${differentJwtToken}`)
        .send(invoiceData)
        .expect(201);
    });
  });

  describe("CSV import rate limiting", () => {
    const csvContent = "clientName,amount,asset_code\nTest Client,100,USDC";
    const csvBuffer = Buffer.from(csvContent, "utf-8");

    it("should allow first 3 import requests", async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post("/invoices/import")
          .set("Authorization", `Bearer ${jwtToken}`)
          .attach("file", csvBuffer, {
            filename: "test.csv",
            contentType: "text/csv",
          })
          .expect(201); // Will likely fail due to missing dependencies but shouldn't be rate limited
      }
    });

    it("should return 429 on 4th import request", async () => {
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post("/invoices/import")
          .set("Authorization", `Bearer ${jwtToken}`)
          .attach("file", csvBuffer, {
            filename: "test.csv",
            contentType: "text/csv",
          })
          .expect(201);
      }

      // 4th request should be rate limited
      await request(app.getHttpServer())
        .post("/invoices/import")
        .set("Authorization", `Bearer ${jwtToken}`)
        .attach("file", csvBuffer, {
          filename: "test.csv",
          contentType: "text/csv",
        })
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("error");
          expect(res.body.error).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });
  });

  describe("Engagement endpoint rate limiting", () => {
    it("should allow first 30 engagement requests", async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post("/invoices/test-invoice-id/events")
          .send({ type: "view" })
          .expect((res) => {
            // Should not be 429
            expect(res.status).not.toBe(429);
          });
      }
    });

    it("should return 429 on 31st engagement request", async () => {
      // Make 30 requests
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post("/invoices/test-invoice-id/events")
          .send({ type: "view" })
          .expect((res) => {
            expect(res.status).not.toBe(429);
          });
      }

      // 31st request should be rate limited
      await request(app.getHttpServer())
        .post("/invoices/test-invoice-id/events")
        .send({ type: "view" })
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("error");
          expect(res.body.error).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });
  });

  describe("Rate limit headers", () => {
    const kp2 = Keypair.random();
    const testPublicKey = kp2.publicKey();
    it("should include proper headers in 429 responses", async () => {
      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey })
          .expect(200);
      }

      // 6th request should return 429 with proper headers
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(429)
        .expect((res) => {
          expect(res.headers).toHaveProperty("retry-after");
          expect(res.headers).toHaveProperty("x-ratelimit-limit");
          expect(res.headers).toHaveProperty("x-ratelimit-remaining");
          expect(res.headers).toHaveProperty("x-ratelimit-reset");

          // Verify retry-after is a reasonable value (should be around 900 seconds for auth)
          const retryAfter = parseInt(res.headers["retry-after"]);
          expect(retryAfter).toBeGreaterThan(0);
          expect(retryAfter).toBeLessThanOrEqual(900_000);
        });
    });
  });

  describe("Identity isolation", () => {
    it("should isolate rate limits between different authenticated users", async () => {
      const jwtService = app.get(JwtService);
      global.mockDb.users["user-a-isolation"] = {
        id: "user-a-isolation",
        merchantId: "m-a",
        tokenVersion: 1,
      };
      global.mockDb.users["user-b-isolation"] = {
        id: "user-b-isolation",
        merchantId: "m-b",
        tokenVersion: 1,
      };
      const userAToken = jwtService.sign({
        sub: "user-a-isolation",
        tokenVersion: 1,
      });
      const userBToken = jwtService.sign({
        sub: "user-b-isolation",
        tokenVersion: 1,
      });

      const invoiceData = {
        clientName: "Isolation Test",
        amount: "50",
        asset_code: "USDC",
        description: "Isolation test invoice",
      };

      // User A makes 20 invoice creation requests (hits limit)
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${userAToken}`)
          .send(invoiceData)
          .expect(201);
      }

      // User A's 21st request should be rate limited
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${userAToken}`)
        .send(invoiceData)
        .expect(429);

      // User B should still be allowed — independent rate limit bucket
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${userBToken}`)
        .send(invoiceData)
        .expect(201);
    });

    it("should isolate public endpoint rate limits by IP", async () => {
      const kpA = Keypair.random();
      const kpB = Keypair.random();
      const testPublicKeyA = kpA.publicKey();
      const testPublicKeyB = kpB.publicKey();

      // First IP (default test client) hits auth/nonce limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKeyA })
          .expect(200);
      }

      // Should be rate limited from this IP
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKeyA })
        .expect(429);

      // Different public key from the SAME IP is still rate limited
      // (IP-based tracking for unauthenticated routes)
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKeyB })
        .expect(429);
    });
  });
});
