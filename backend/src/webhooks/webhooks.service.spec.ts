import { Test, TestingModule } from "@nestjs/testing";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("WebhooksService", () => {
  let service: WebhooksService;

  const mockPrismaService = {
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
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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

      const result = await service.rotateWebhookSecret(
        "user-2",
        "merchant-2",
      );

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
      } as any);

      const delivery = {
        id: "del-1",
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
        select: { webhookSecret: true },
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
      } as any);

      const delivery = {
        id: "del-2",
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

    it("should mark as failed permanently after 5 attempts", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Network Error"));
      mockPrismaService.user.findUnique.mockResolvedValue({
        webhookSecret: null,
      } as any);

      const delivery = {
        id: "del-max",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 4,
        userId: "user-max",
        user: {},
      };

      await service.deliver(delivery);

      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: "del-max" },
        data: expect.objectContaining({
          status: "failed",
          attempts: 5,
        }),
      });
    });
  });
});
