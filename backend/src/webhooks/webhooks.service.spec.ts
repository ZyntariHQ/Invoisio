import { Test, TestingModule } from "@nestjs/testing";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("WebhooksService", () => {
  let service: WebhooksService;

  const mockTransactionClient = {
    webhookDelivery: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    webhookDeadLetter: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrismaService = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    webhookDelivery: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhookDeadLetter: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockTransactionClient),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe("webhook secret management", () => {
    it("returns masked metadata without exposing the raw secret", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        webhookSecret: "0123456789abcdef",
      } as any);

      const metadata = await service.getWebhookSecretMetadata(
        "user-1",
        "merchant-1",
      );

      expect(metadata).toEqual({
        hasSecret: true,
        maskedSecret: "0123...cdef",
        secretLength: 16,
      });
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: "user-1", merchantId: "merchant-1" },
        select: { webhookSecret: true },
      });
    });

    it("rotates and persists a new secret", async () => {
      mockPrismaService.user.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.rotateWebhookSecret("user-2", "merchant-2");

      expect(result.secret).toHaveLength(64);
      expect(result.metadata.hasSecret).toBe(true);
      expect(result.metadata.secretLength).toBe(64);
      expect(result.metadata.maskedSecret).toMatch(/^.{4}\.\.\..{4}$/);
      expect(mockPrismaService.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-2", merchantId: "merchant-2" },
          data: {
            webhookSecret: expect.any(String),
          },
        }),
      );
    });
  });

  describe("enqueueWebhook", () => {
    it("should enqueue a delivery using the merchant-scoped webhook URL", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        userId: "user-1",
        merchant: { webhookUrl: "https://example.com/webhook" },
      } as any);

      await service.enqueueWebhook("inv-1", "paid", "hash-123");

      expect(mockPrismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        include: { merchant: true },
      });
      expect(mockPrismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: "inv-1",
            userId: "user-1",
            url: "https://example.com/webhook",
            status: "pending",
            attempts: 0,
          }),
        }),
      );
    });

    it("should enqueue a delivery from the merchant URL even when the user row has no webhook URL", async () => {
      // Regression: deliveries must follow the merchant settings the merchant
      // manages, not the legacy user-level field.
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        userId: "user-1",
        merchant: { webhookUrl: "https://merchant.example.com/webhook" },
      } as any);

      await service.enqueueWebhook("inv-1", "paid", "hash-123");

      expect(mockPrismaService.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://merchant.example.com/webhook",
          }),
        }),
      );
    });

    it("should skip enqueueing if no merchant webhook URL is configured", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-2",
        userId: "user-2",
        merchant: { webhookUrl: null },
      } as any);

      await service.enqueueWebhook("inv-2", "paid", "hash-123");
      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it("should skip enqueueing when only the user row has a webhook URL but the merchant does not", async () => {
      // Regression: a legacy user-level webhook URL must not shadow the
      // merchant-scoped configuration.
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-2",
        userId: "user-2",
        merchant: { webhookUrl: null },
      } as any);

      await service.enqueueWebhook("inv-2", "paid", "hash-123");
      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });
  });

  describe("deliver", () => {
    it("should execute delivery successfully and use the latest secret from the database", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "secret",
        merchantId: "merchant-1",
      } as any);

      const delivery = {
        id: "del-1",
        invoiceId: "inv-1",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 0,
        userId: "user-1",
        user: { webhookSecret: "old-secret" },
      };

      await service.deliver(delivery);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const postArgs = mockedAxios.post.mock.calls[0];
      expect(postArgs[0]).toBe("https://example.com/webhook");
      expect(postArgs[2]?.headers?.["x-idempotency-key"]).toBe("del-1-0");
      expect(postArgs[2]?.headers?.["x-invoisio-signature"]).toBeDefined();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { webhookSecret: true, merchantId: true },
      });
      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: "del-1" },
        data: expect.objectContaining({
          status: "success",
          attempts: 1,
        }),
      });
    });

    it("should apply exponential backoff on failure", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Timeout"));
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: null,
        merchantId: "merchant-2",
      } as any);

      const delivery = {
        id: "del-2",
        invoiceId: "inv-2",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 1,
        userId: "user-2",
        user: {},
      };

      await service.deliver(delivery);

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledTimes(1);

      const updateCall =
        mockPrismaService.webhookDelivery.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe("del-2");
      expect(updateCall.data.attempts).toBe(2);
      expect(updateCall.data.status).toBeUndefined();
      expect(updateCall.data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it("moves exhausted deliveries into the dead-letter queue", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Network Error"));
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: null,
        merchantId: "merchant-9",
      } as any);

      const delivery = {
        id: "del-max",
        invoiceId: "inv-max",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 4,
        userId: "user-max",
        user: {},
      };

      await service.deliver(delivery);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(
        mockTransactionClient.webhookDeadLetter.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          originalDeliveryId: "del-max",
          invoiceId: "inv-max",
          userId: "user-max",
          merchantId: "merchant-9",
          failedAttempts: 5,
          status: "pending_retry",
          lastError: "Network Error",
        }),
      });
      expect(mockTransactionClient.webhookDelivery.delete).toHaveBeenCalledWith(
        {
          where: { id: "del-max" },
        },
      );
    });

    it("marks dead-letter jobs as recovered when a manual retry succeeds", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: "secret",
        merchantId: "merchant-1",
      } as any);

      const delivery = {
        id: "del-redrive",
        invoiceId: "inv-redrive",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 0,
        userId: "user-1",
        deadLetterId: "dlq-1",
      };

      await service.deliver(delivery);

      expect(mockPrismaService.webhookDeadLetter.update).toHaveBeenCalledWith({
        where: { id: "dlq-1" },
        data: expect.objectContaining({
          status: "recovered",
          recoveredAt: expect.any(Date),
        }),
      });
    });
  });

  describe("sendTestDelivery", () => {
    const baseUser = {
      webhookSecret: "testsecret",
    };
    const baseMerchant = {
      webhookUrl: "https://merchant.example.com/webhook",
    };

    beforeEach(() => {
      mockPrismaService.user.findFirst.mockResolvedValue(baseUser as any);
      mockPrismaService.merchant.findUnique.mockResolvedValue(
        baseMerchant as any,
      );
    });

    it("returns success=true with httpStatus and durationMs when endpoint responds 2xx", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      const result = await service.sendTestDelivery("user-1", "merchant-1");

      expect(result.success).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.failureReason).toBeNull();
      expect(result.sentAt).toBeDefined();
    });

    it("reads the destination URL from the merchant configuration and the secret from the merchant-scoped user", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      await service.sendTestDelivery("user-1", "merchant-1");

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: "user-1", merchantId: "merchant-1" },
        select: { webhookSecret: true },
      });
      expect(mockPrismaService.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: "merchant-1" },
        select: { webhookUrl: true },
      });
    });

    it("sends the payload with x-invoisio-test-delivery header and HMAC signature", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      await service.sendTestDelivery("user-1", "merchant-1");

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, payload, config] = mockedAxios.post.mock.calls[0];

      expect(url).toBe("https://merchant.example.com/webhook");
      expect((payload as any).event).toBe("test");
      expect((payload as any).invoiceId).toBe("__test__");
      expect(config?.headers?.["x-invoisio-test-delivery"]).toBe("true");
      expect(config?.headers?.["x-invoisio-signature"]).toBeDefined();
      // Signature must be a non-empty hex string
      expect(
        (config?.headers?.["x-invoisio-signature"] as string).length,
      ).toBeGreaterThan(0);
    });

    it("returns an empty signature when no webhook secret is configured", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        webhookSecret: null,
      } as any);
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      await service.sendTestDelivery("user-1", "merchant-1");

      const [, , config] = mockedAxios.post.mock.calls[0];
      expect(config?.headers?.["x-invoisio-signature"]).toBe("");
    });

    it("returns success=false with httpStatus when endpoint responds 4xx", async () => {
      mockedAxios.post.mockResolvedValue({ status: 401 } as any);

      const result = await service.sendTestDelivery("user-1", "merchant-1");

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(401);
      expect(result.failureReason).toMatch(/401/);
    });

    it("returns success=false with a network-level failure reason on timeout", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(baseUser as any);

      const timeoutError = Object.assign(
        new Error("timeout of 10000ms exceeded"),
        {
          isAxiosError: true,
          code: "ECONNABORTED",
        },
      );
      (timeoutError as any).isAxiosError = true;
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;
      mockedAxios.post.mockRejectedValue(timeoutError);

      const result = await service.sendTestDelivery("user-1", "merchant-1");

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBeNull();
      expect(result.failureReason).toMatch(/timed out/i);
    });

    it("returns success=false with a DNS failure reason on ENOTFOUND", async () => {
      const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        isAxiosError: true,
        code: "ENOTFOUND",
      });
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;
      mockedAxios.post.mockRejectedValue(dnsError);

      const result = await service.sendTestDelivery("user-1", "merchant-1");

      expect(result.success).toBe(false);
      expect(result.failureReason).toMatch(/DNS/i);
    });

    it("returns success=false with a connection-refused reason on ECONNREFUSED", async () => {
      const connError = Object.assign(new Error("connect ECONNREFUSED"), {
        isAxiosError: true,
        code: "ECONNREFUSED",
      });
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;
      mockedAxios.post.mockRejectedValue(connError);

      const result = await service.sendTestDelivery("user-1", "merchant-1");

      expect(result.success).toBe(false);
      expect(result.failureReason).toMatch(/connection refused/i);
    });

    it("does NOT write to WebhookDelivery table during test delivery", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      await service.sendTestDelivery("user-1", "merchant-1");

      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it("throws UnprocessableEntityException when the merchant has no webhook URL configured", async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValue({
        webhookUrl: null,
      } as any);

      await expect(
        service.sendTestDelivery("user-1", "merchant-1"),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the user is not found", async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null as any);

      await expect(
        service.sendTestDelivery("user-1", "merchant-1"),
      ).rejects.toThrow("User not found");
    });

    it("throws NotFoundException when the merchant is not found", async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValue(null as any);

      await expect(
        service.sendTestDelivery("user-1", "merchant-1"),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("dead-letter admin tooling", () => {
    it("lists dead-letter jobs with the provided filters", async () => {
      const expected = [{ id: "dlq-1" }];
      mockPrismaService.webhookDeadLetter.findMany.mockResolvedValue(
        expected as any,
      );

      const result = await service.listDeadLetters({
        status: "pending_retry" as any,
        limit: 25,
      });

      expect(result).toBe(expected);
      expect(mockPrismaService.webhookDeadLetter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "pending_retry" },
          take: 25,
        }),
      );
    });

    it("queues a manual retry for a dead-letter job", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-2",
        invoiceId: "inv-2",
        userId: "user-2",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        status: "pending_retry",
      } as any);
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue(
        null as any,
      );
      mockTransactionClient.webhookDelivery.create.mockResolvedValue({
        id: "del-retry",
      } as any);

      const result = await service.retryDeadLetter("dlq-2");

      expect(result).toEqual({
        deadLetterId: "dlq-2",
        deliveryId: "del-retry",
        status: "requeued",
      });
      expect(mockTransactionClient.webhookDelivery.create).toHaveBeenCalledWith(
        {
          data: expect.objectContaining({
            invoiceId: "inv-2",
            userId: "user-2",
            deadLetterId: "dlq-2",
            status: "pending",
            attempts: 0,
          }),
        },
      );
      expect(
        mockTransactionClient.webhookDeadLetter.update,
      ).toHaveBeenCalledWith({
        where: { id: "dlq-2" },
        data: expect.objectContaining({
          status: "requeued",
          manualRetryCount: { increment: 1 },
          lastRetriedAt: expect.any(Date),
        }),
      });
    });

    it("rejects duplicate manual retries while a retry is already pending", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-3",
        invoiceId: "inv-3",
        userId: "user-3",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        status: "pending_retry",
      } as any);
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue({
        id: "del-existing",
      } as any);

      await expect(service.retryDeadLetter("dlq-3")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ── Merchant-scoped delivery history ──────────────────────────────────────

  describe("listMerchantDeliveries", () => {
    it("returns deliveries filtered by the merchant's invoices", async () => {
      const expected = [{ id: "del-1", invoiceId: "inv-1", status: "success" }];
      mockPrismaService.webhookDelivery.findMany.mockResolvedValue(
        expected as any,
      );

      const result = await service.listMerchantDeliveries("merchant-1");

      expect(result).toBe(expected);
      expect(mockPrismaService.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoice: { merchantId: "merchant-1" } },
        }),
      );
    });

    it("applies cursor and limit when provided", async () => {
      mockPrismaService.webhookDelivery.findMany.mockResolvedValue([] as any);

      await service.listMerchantDeliveries("merchant-1", {
        cursor: "cursor-id-123",
        limit: 10,
      });

      expect(mockPrismaService.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          cursor: { id: "cursor-id-123" },
          skip: 1,
        }),
      );
    });

    it("does not expose raw payload in the response", async () => {
      mockPrismaService.webhookDelivery.findMany.mockResolvedValue([] as any);

      await service.listMerchantDeliveries("merchant-2");

      const call = mockPrismaService.webhookDelivery.findMany.mock.calls[0][0];
      // Payload is NOT included in select — only safe fields
      expect(call.select?.payload).toBeUndefined();
    });
  });

  describe("listMerchantDeadLetters", () => {
    it("returns dead letters scoped to the merchant", async () => {
      const expected = [{ id: "dlq-m1", merchantId: "merchant-A" }];
      mockPrismaService.webhookDeadLetter.findMany.mockResolvedValue(
        expected as any,
      );

      const result = await service.listMerchantDeadLetters("merchant-A");

      expect(result).toBe(expected);
      expect(mockPrismaService.webhookDeadLetter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: "merchant-A" }),
        }),
      );
    });

    it("applies an optional status filter", async () => {
      mockPrismaService.webhookDeadLetter.findMany.mockResolvedValue([] as any);

      await service.listMerchantDeadLetters("merchant-B", {
        status: "pending_retry" as any,
      });

      expect(mockPrismaService.webhookDeadLetter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: "merchant-B", status: "pending_retry" },
        }),
      );
    });
  });

  describe("retryMerchantDeadLetter", () => {
    it("successfully re-queues a dead letter owned by the merchant", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-own",
        merchantId: "merchant-C",
        invoiceId: "inv-c",
        userId: "user-c",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        status: "pending_retry",
      } as any);
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue(
        null as any,
      );
      mockTransactionClient.webhookDelivery.create.mockResolvedValue({
        id: "del-new",
      } as any);

      const result = await service.retryMerchantDeadLetter(
        "dlq-own",
        "merchant-C",
      );

      expect(result).toEqual({
        deadLetterId: "dlq-own",
        deliveryId: "del-new",
        status: "requeued",
      });
    });

    it("returns 404 when the dead letter belongs to a different merchant (ownership denial)", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-other",
        merchantId: "merchant-OTHER",
        status: "pending_retry",
      } as any);

      await expect(
        service.retryMerchantDeadLetter("dlq-other", "merchant-MINE"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns 404 when the dead letter does not exist", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue(
        null as any,
      );

      await expect(
        service.retryMerchantDeadLetter("nonexistent", "merchant-X"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a retry when the dead letter is already recovered", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-rec",
        merchantId: "merchant-D",
        status: "recovered",
      } as any);

      await expect(
        service.retryMerchantDeadLetter("dlq-rec", "merchant-D"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a retry when a pending retry already exists", async () => {
      mockPrismaService.webhookDeadLetter.findUnique.mockResolvedValue({
        id: "dlq-pending",
        merchantId: "merchant-E",
        status: "pending_retry",
      } as any);
      mockPrismaService.webhookDelivery.findFirst.mockResolvedValue({
        id: "del-already",
      } as any);

      await expect(
        service.retryMerchantDeadLetter("dlq-pending", "merchant-E"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
