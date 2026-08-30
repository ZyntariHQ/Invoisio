import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import { SafeWebhookHttpService } from "../common/security/safe-webhook-http.service";
import * as crypto from "crypto";

describe("WebhooksService", () => {
  let service: WebhooksService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
    },
    webhookDelivery: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    webhookDeadLetter: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  // The only outbound HTTP surface WebhooksService talks to. Every network
  // scenario (success, 4xx, timeout, DNS failure, connection refused) is
  // driven by mocking this single method's return value - the service
  // itself no longer touches axios/dns directly.
  const mockSafeWebhookHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SafeWebhookHttpService, useValue: mockSafeWebhookHttpService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe("webhook secret management", () => {
    it("returns masked metadata without exposing the raw secret", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        webhookSecret: "abcd1234efgh5678",
      });

      const result = await service.getWebhookSecretMetadata(
        "user-1",
        "merchant-1",
      );

      expect(result.hasSecret).toBe(true);
      expect(result.secretLength).toBe(16);
      expect(result.maskedSecret).not.toBe("abcd1234efgh5678");
      expect(result.maskedSecret).toContain("...");
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: "user-1", merchantId: "merchant-1" },
        select: { webhookSecret: true },
      });
    });

    it("rotates and persists a new secret", async () => {
      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rotateWebhookSecret(
        "user-1",
        "merchant-1",
      );

      expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(result.metadata.hasSecret).toBe(true);
      expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user-1", merchantId: "merchant-1" },
        data: { webhookSecret: result.secret },
      });
    });

    it("throws NotFoundException when rotating for a user that does not exist", async () => {
      mockPrismaService.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.rotateWebhookSecret("missing-user", "merchant-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("enqueueWebhook", () => {
    it("should enqueue a delivery using the merchant-scoped webhook URL", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "invoice-1",
        userId: "user-1",
        merchant: { webhookUrl: "https://public.example.com/hook" },
      });
      mockPrismaService.webhookDelivery.create.mockResolvedValue({
        id: "delivery-1",
      });

      await service.enqueueWebhook("invoice-1", "paid", "tx-1", "merchant-1");

      expect(mockPrismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: "invoice-1",
            userId: "user-1",
            url: "https://public.example.com/hook",
            status: "pending",
            attempts: 0,
          }),
        }),
      );
    });

    it("should enqueue a delivery from the merchant URL even when the user row has no webhook URL", async () => {
      // The merchant-scoped URL is the source of truth; per-user webhook
      // secret/config on the user row is unrelated to whether a delivery
      // gets enqueued.
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "invoice-2",
        userId: "user-2",
        merchant: { webhookUrl: "https://public.example.com/hook" },
      });
      mockPrismaService.webhookDelivery.create.mockResolvedValue({
        id: "delivery-2",
      });

      await service.enqueueWebhook("invoice-2", "paid", null, "merchant-1");

      expect(mockPrismaService.webhookDelivery.create).toHaveBeenCalled();
    });

    it("should skip enqueueing if no merchant webhook URL is configured", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "invoice-3",
        userId: "user-3",
        merchant: { webhookUrl: null },
      });

      await service.enqueueWebhook("invoice-3", "paid", null, "merchant-1");

      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it("should skip enqueueing when only the user row has a webhook URL but the merchant does not", async () => {
      // enqueueWebhook only ever reads invoice.merchant.webhookUrl - there
      // is no per-user webhookUrl field it falls back to.
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "invoice-4",
        userId: "user-4",
        merchant: { webhookUrl: undefined },
      });

      await service.enqueueWebhook("invoice-4", "paid", null, "merchant-1");

      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });
  });

  describe("deliver", () => {
    const baseDelivery = {
      id: "delivery-1",
      invoiceId: "invoice-1",
      userId: "user-1",
      url: "https://public.example.com/hook",
      payload: { invoiceId: "invoice-1", status: "paid" },
      attempts: 0,
      deadLetterId: null,
    };

    it("should execute delivery successfully and use the latest secret from the database", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "current-secret",
        merchantId: "merchant-1",
      });
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 42,
        failureCode: null,
        failureReason: null,
      });
      mockPrismaService.webhookDelivery.update.mockResolvedValue({});

      await service.deliver(baseDelivery);

      expect(mockSafeWebhookHttpService.post).toHaveBeenCalledWith(
        baseDelivery.url,
        baseDelivery.payload,
        expect.objectContaining({
          "Content-Type": "application/json",
          "x-idempotency-key": "delivery-1-0",
        }),
      );

      const expectedSignature = crypto
        .createHmac("sha256", "current-secret")
        .update(JSON.stringify(baseDelivery.payload))
        .digest("hex");
      const callHeaders = mockSafeWebhookHttpService.post.mock.calls[0][2];
      expect(callHeaders["x-invoisio-signature"]).toBe(expectedSignature);

      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "delivery-1" },
          data: expect.objectContaining({ status: "success", attempts: 1 }),
        }),
      );
    });

    it("should apply exponential backoff on failure", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "current-secret",
        merchantId: "merchant-1",
      });
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: null,
        durationMs: 10,
        failureCode: "unreachable",
        failureReason: "The endpoint could not be reached.",
      });
      mockPrismaService.webhookDelivery.update.mockResolvedValue({});

      await service.deliver({ ...baseDelivery, attempts: 1 });

      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "delivery-1" },
          data: expect.objectContaining({ attempts: 2 }),
        }),
      );
      const updateArgs = mockPrismaService.webhookDelivery.update.mock.calls[0][0];
      expect(updateArgs.data.nextAttemptAt).toBeInstanceOf(Date);
      expect(updateArgs.data.nextAttemptAt.getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it("moves exhausted deliveries into the dead-letter queue", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "current-secret",
        merchantId: "merchant-1",
      });
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: null,
        durationMs: 10,
        failureCode: "unreachable",
        failureReason: "The endpoint could not be reached.",
      });
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          webhookDeadLetter: mockPrismaService.webhookDeadLetter,
          webhookDelivery: mockPrismaService.webhookDelivery,
        }),
      );
      mockPrismaService.webhookDeadLetter.create.mockResolvedValue({
        id: "dead-letter-1",
      });
      mockPrismaService.webhookDelivery.delete.mockResolvedValue({});

      await service.deliver({ ...baseDelivery, attempts: 4 });

      expect(mockPrismaService.webhookDeadLetter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: "merchant-1",
            url: baseDelivery.url,
            lastError: "The endpoint could not be reached.",
            failedAttempts: 5,
            status: "pending_retry",
          }),
        }),
      );
      expect(mockPrismaService.webhookDelivery.delete).toHaveBeenCalledWith({
        where: { id: "delivery-1" },
      });
    });

    it("marks dead-letter jobs as recovered when a manual retry succeeds", async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "current-secret",
        merchantId: "merchant-1",
      });
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 15,
        failureCode: null,
        failureReason: null,
      });
      mockPrismaService.webhookDelivery.update.mockResolvedValue({});
      mockPrismaService.webhookDeadLetter.update.mockResolvedValue({});

      await service.deliver({
        ...baseDelivery,
        deadLetterId: "dead-letter-1",
      });

      expect(mockPrismaService.webhookDeadLetter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "dead-letter-1" },
          data: expect.objectContaining({ status: "recovered" }),
        }),
      );
    });
  });

  describe("sendTestDelivery", () => {
    const merchantId = "merchant-1";
    const userId = "user-1";

    beforeEach(() => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        webhookSecret: "test-secret",
      });
      mockPrismaService.merchant.findUnique.mockResolvedValue({
        webhookUrl: "https://public.example.com/hook",
      });
    });

    it("returns success=true with httpStatus and durationMs when endpoint responds 2xx", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 55,
        failureCode: null,
        failureReason: null,
      });

      const result = await service.sendTestDelivery(userId, merchantId);

      expect(result.success).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.durationMs).toBe(55);
      expect(result.failureReason).toBeNull();
      expect(typeof result.sentAt).toBe("string");
    });

    it("reads the destination URL from the merchant configuration and the secret from the merchant-scoped user", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 10,
        failureCode: null,
        failureReason: null,
      });

      await service.sendTestDelivery(userId, merchantId);

      expect(mockPrismaService.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: merchantId },
        select: { webhookUrl: true },
      });
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: userId, merchantId },
        select: { webhookSecret: true },
      });
      expect(mockSafeWebhookHttpService.post).toHaveBeenCalledWith(
        "https://public.example.com/hook",
        expect.objectContaining({ event: "test" }),
        expect.any(Object),
      );
    });

    it("sends the payload with x-invoisio-test-delivery header and HMAC signature", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 10,
        failureCode: null,
        failureReason: null,
      });

      await service.sendTestDelivery(userId, merchantId);

      const [, payload, headers] = mockSafeWebhookHttpService.post.mock.calls[0];
      expect(headers["x-invoisio-test-delivery"]).toBe("true");
      expect(headers["x-invoisio-signature"]).toMatch(/^[0-9a-f]{64}$/);

      const expectedSignature = crypto
        .createHmac("sha256", "test-secret")
        .update(JSON.stringify(payload))
        .digest("hex");
      expect(headers["x-invoisio-signature"]).toBe(expectedSignature);
    });

    it("returns an empty signature when no webhook secret is configured", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        webhookSecret: null,
      });
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 10,
        failureCode: null,
        failureReason: null,
      });

      await service.sendTestDelivery(userId, merchantId);

      const [, , headers] = mockSafeWebhookHttpService.post.mock.calls[0];
      expect(headers["x-invoisio-signature"]).toBe("");
    });

    it("returns success=false with httpStatus when endpoint responds 4xx", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: 404,
        durationMs: 20,
        failureCode: "non_2xx",
        failureReason: "Endpoint responded with HTTP 404.",
      });

      const result = await service.sendTestDelivery(userId, merchantId);

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(404);
      expect(result.failureReason).toBe("Endpoint responded with HTTP 404.");
    });

    it("returns success=false with a generic failure reason on timeout (no raw network text is exposed)", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: null,
        durationMs: 10000,
        failureCode: "timeout",
        failureReason: "The endpoint did not respond in time.",
      });

      const result = await service.sendTestDelivery(userId, merchantId);

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBeNull();
      expect(result.failureReason).toBe("The endpoint did not respond in time.");
    });

    it("returns success=false with a generic unreachable reason on DNS failure (no ENOTFOUND text is exposed)", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: null,
        durationMs: 5,
        failureCode: "unreachable",
        failureReason: "The endpoint could not be reached.",
      });

      const result = await service.sendTestDelivery(userId, merchantId);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe("The endpoint could not be reached.");
      expect(result.failureReason).not.toMatch(/ENOTFOUND/i);
    });

    it("returns success=false with a generic unreachable reason on connection refused (no ECONNREFUSED text is exposed)", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: false,
        httpStatus: null,
        durationMs: 5,
        failureCode: "unreachable",
        failureReason: "The endpoint could not be reached.",
      });

      const result = await service.sendTestDelivery(userId, merchantId);

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe("The endpoint could not be reached.");
      expect(result.failureReason).not.toMatch(/ECONNREFUSED/i);
    });

    it("does NOT write to WebhookDelivery table during test delivery", async () => {
      mockSafeWebhookHttpService.post.mockResolvedValue({
        success: true,
        httpStatus: 200,
        durationMs: 10,
        failureCode: null,
        failureReason: null,
      });

      await service.sendTestDelivery(userId, merchantId);

      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it("throws UnprocessableEntityException when the merchant has no webhook URL configured", async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValue({
        webhookUrl: null,
      });

      await expect(
        service.sendTestDelivery(userId, merchantId),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mockSafeWebhookHttpService.post).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user is not found", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.sendTestDelivery(userId, merchantId),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the merchant is not found", async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.sendTestDelivery(userId, merchantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("dead-letter admin tooling", () => {
    it("lists dead-letter jobs with the provided filters", async () => {
      mockPrismaService.webhookDeadLetter.findMany.mockResolvedValue([
        { id: "dead-letter-1" },
      ]);

      const result = await service.listDeadLetters({
        status: "pending_retry" as any,
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(mockPrismaService.webhookDeadLetter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "pending_retry" },
          take: 10,
        }),
      );
    });

    it("queues a manual retry for a dead-letter job", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dead-letter-1",
        status: "pending_retry",
        invoiceId: "invoice-1",
        userId: "user-1",
        url: "https://public.example.com/hook",
        payload: { foo: "bar" },
      });
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          webhookDelivery: {
            create: jest.fn().mockResolvedValue({ id: "delivery-new" }),
          },
          webhookDeadLetter: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.retryDeadLetter("dead-letter-1");

      expect(result).toEqual({
        deadLetterId: "dead-letter-1",
        deliveryId: "delivery-new",
        status: "requeued",
      });
    });

    it("rejects duplicate manual retries while a retry is already pending", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dead-letter-1",
        status: "pending_retry",
      });
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue({
        id: "delivery-existing",
      });

      await expect(service.retryDeadLetter("dead-letter-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
