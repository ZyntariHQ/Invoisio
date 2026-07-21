import { Test, TestingModule } from "@nestjs/testing";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import { BadRequestException } from "@nestjs/common";

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
    webhookDelivery: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhookAttempt: {
      create: jest.fn(),
      findMany: jest.fn(),
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
    it("should enqueue a delivery if user has a webhook URL configured", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
        userId: "user-1",
        user: { webhookUrl: "https://example.com/webhook" },
      } as any);

      await service.enqueueWebhook("inv-1", "paid", "hash-123");

      expect(mockPrismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        include: { user: true },
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

    it("should skip enqueueing if no webhook URL is configured", async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-2",
        userId: "user-2",
        user: { webhookUrl: null },
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
      expect(mockPrismaService.webhookAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: "del-1",
          invoiceId: "inv-1",
          userId: "user-1",
          requestUrl: "https://example.com/webhook",
          attemptNumber: 1,
          responseStatusCode: 200,
          status: "success",
          signaturePresent: true,
          signatureAlgorithm: "hmac-sha256",
          signaturePreview: expect.stringMatching(/^.{6}\.\.\..{6}$/),
          signatureLength: expect.any(Number),
        }),
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
      expect(mockPrismaService.webhookAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: "del-2",
          invoiceId: "inv-2",
          userId: "user-2",
          attemptNumber: 2,
          responseStatusCode: null,
          errorMessage: "Timeout",
          status: "failed",
          signaturePresent: false,
          signatureAlgorithm: null,
          signaturePreview: null,
          signatureLength: null,
        }),
      });
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

  describe("dead-letter admin tooling", () => {
    it("lists webhook attempts for a merchant-owned invoice", async () => {
      const expected = [{ id: "attempt-1", attemptNumber: 2 }];
      mockPrismaService.invoice.findFirst.mockResolvedValue({
        id: "inv-1",
      } as any);
      mockPrismaService.webhookAttempt.findMany.mockResolvedValue(
        expected as any,
      );

      const result = await service.listInvoiceWebhookAttempts(
        "inv-1",
        "merchant-1",
        { limit: 25 },
      );

      expect(result).toBe(expected);
      expect(mockPrismaService.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: "inv-1", merchantId: "merchant-1" },
        select: { id: true },
      });
      expect(mockPrismaService.webhookAttempt.findMany).toHaveBeenCalledWith({
        where: { invoiceId: "inv-1" },
        take: 25,
        orderBy: [{ createdAt: "desc" }, { attemptNumber: "desc" }],
        select: expect.objectContaining({
          id: true,
          requestPayload: true,
          responseStatusCode: true,
          signaturePreview: true,
        }),
      });
    });

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
});
