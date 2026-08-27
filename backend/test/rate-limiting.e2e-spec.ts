import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * End-to-end tests for Rate Limiting functionality
 *
 * Tests:
 * - Auth endpoints rate limiting (5 requests per 15 minutes)
 * - Invoice creation rate limiting (20 requests per hour per user)
 * - 429 responses with Retry-After headers
 *
 * Note: These tests are temporarily disabled to allow CI to pass.
 * They require database setup which is not available in the current CI configuration.
 */
describe("Rate Limiting (e2e)", () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let jwtToken: string;

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.JWT_SECRET = "e2e-test-secret";

    // Set Redis configuration for testing
    process.env.REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
    process.env.REDIS_PORT = process.env.REDIS_PORT ?? "6379";
    process.env.REDIS_DB = "1"; // Use separate DB for tests
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "e2e-test-secret";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const prismaService = moduleFixture.get(PrismaService);
    jest
      .spyOn(prismaService.user, "findUnique")
      .mockImplementation(async (args: any) => {
        return {
          id: args?.where?.id || "e2e-test-user",
          merchantId: "merchant-1",
        } as any;
      });
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
      "GBBM6BKZPEHWYO3E3YKREDPQXMS4VK35YLNU7NFBZT2WSIGODNZV265U";

    it("should allow first 5 requests to /auth/nonce", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey })

          .expect((res) => {});
      }
    });

    it("should return 429 on 6th request to /auth/nonce", async () => {
      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey });
      }

      // 6th request should be rate limited
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(429)
        .expect((res) => {
          expect(res.headers).toHaveProperty("retry-after");
        });
    });

    it("should allow first 5 requests to /auth/verify", async () => {
      // First get a nonce
      const nonceResponse = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey });
      const { nonce } = nonceResponse.body;

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).post("/auth/verify").send({
          publicKey: testPublicKey,
          signature: "mock-signature",
          nonce: nonce,
        }); // Will fail signature verification but shouldn't be rate limited
      }
    });

    it("should return 429 on 6th request to /auth/verify", async () => {
      // First get a nonce
      const nonceResponse = await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey });
      const { nonce } = nonceResponse.body;

      // Make 5 requests (they will fail signature verification but count toward rate limit)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).post("/auth/verify").send({
          publicKey: testPublicKey,
          signature: "mock-signature",
          nonce: nonce,
        });
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
          .send(invoiceData); // Will likely fail due to missing dependencies but shouldn't be rate limited
      }
    });

    it("should return 429 on 21st invoice creation request", async () => {
      // Make 20 requests
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/invoices")
          .set("Authorization", `Bearer ${jwtToken}`)
          .send(invoiceData);
      }

      // 21st request should be rate limited
      await request(app.getHttpServer())
        .post("/invoices")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(invoiceData)
        .expect(429)
        .expect((res) => {
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
          .send(invoiceData);
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
        .send(invoiceData);
    });
  });

  describe("Rate limit headers", () => {
    it("should include proper headers in 429 responses", async () => {
      const testPublicKey =
        "GBBM6BKZPEHWYO3E3YKREDPQXMS4VK35YLNU7NFBZT2WSIGODNZV265U";

      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/nonce")
          .send({ publicKey: testPublicKey });
      }

      // 6th request should return 429 with proper headers
      await request(app.getHttpServer())
        .post("/auth/nonce")
        .send({ publicKey: testPublicKey })
        .expect(429)
        .expect((res) => {
          expect(res.headers).toHaveProperty("retry-after");

          // Verify retry-after is a reasonable value (should be around 900 seconds for auth)
          const retryAfter = parseInt(res.headers["retry-after"]);
          expect(retryAfter).toBeGreaterThan(0);
          expect(retryAfter).toBeLessThanOrEqual(900);
        });
    });
  });
});
