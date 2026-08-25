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

  describe("Auth endpoints rate limiting", () => {
    const testPublicKey =
      "GD5DJ3B5A7PSBUKX7UHD3RO6X4JLFJRG2EMITJD4FNE2ZQY4C7I5LHN5";

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
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toContain("Too Many Requests");
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
            signature: "mock-signature",
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
            signature: "mock-signature",
            nonce: nonce,
          })
          .expect(200);
      }

      // 6th request should be rate limited
      await request(app.getHttpServer())
        .post("/auth/verify")
        .send({
          publicKey: testPublicKey,
          signature: "mock-signature",
          nonce: nonce,
        })
        .expect(429)
        .expect((res) => {
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });
  });

  describe("Invoice creation rate limiting", () => {
    const invoiceData = {
      clientName: "Test Client",
      amount: "100",
      asset_code: "USDC",
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
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });

    it("should not rate limit different users", async () => {
      // Create JWT for a different user
      const jwtService = app.get(JwtService);
      const differentJwtToken = jwtService.sign({ sub: "different-test-user" });

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
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toContain("Too Many Requests");
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
          expect(res.body).toHaveProperty("message");
          expect(res.body.message).toContain("Too Many Requests");
          expect(res.headers).toHaveProperty("retry-after");
        });
    });
  });

  describe("Rate limit headers", () => {
    it("should include proper headers in 429 responses", async () => {
      const testPublicKey =
        "GD5DJ3B5A7PSBUKX7UHD3RO6X4JLFJRG2EMITJD4FNE2ZQY4C7I5LHN5";

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
      const userAToken = jwtService.sign({ sub: "user-a-isolation" });
      const userBToken = jwtService.sign({ sub: "user-b-isolation" });

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
      const testPublicKeyA =
        "GD5DJ3B5A7PSBUKX7UHD3RO6X4JLFJRG2EMITJD4FNE2ZQY4C7I5LHN5";
      const testPublicKeyB =
        "GBX4Mir5PMGZ2J5FZ6C6Q2CKM6VZ7J6Y3B5A7PSBUKX7UHD3RO6X4JL";

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
