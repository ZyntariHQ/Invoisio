import { Test, TestingModule } from "@nestjs/testing";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("WebhooksService", () => {
  let service: WebhooksService;
  let prisma: PrismaService;

  const mockPrismaService = {
    invoice: {
      findUnique: jest.fn(),
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
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("enqueueWebhook", () => {
    it("should enqueue a delivery if user has a webhook URL configured", async () => {
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: "inv-1",
        userId: "user-1",
        user: { webhookUrl: "https://example.com/webhook" },
      } as any);

      await service.enqueueWebhook("inv-1", "paid", "hash-123");

      expect(mockPrismaService.invoice.findUnique).toHaveBeenCalledWith({
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
      mockPrismaService.invoice.findUnique.mockResolvedValue({
        id: "inv-2",
        userId: "user-2",
        user: { webhookUrl: null }, // no webhook URL
      } as any);

      await service.enqueueWebhook("inv-2", "paid", "hash-123");
      expect(mockPrismaService.webhookDelivery.create).not.toHaveBeenCalled();
    });
  });

  describe("deliver", () => {
    it("should execute delivery successfully and update status", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 } as any);

      const delivery = {
        id: "del-1",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 0,
        user: { webhookSecret: "secret" },
      };

      await service.deliver(delivery);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const postArgs = mockedAxios.post.mock.calls[0];
      expect(postArgs[0]).toBe("https://example.com/webhook");
      expect(postArgs[2]?.headers?.["x-invoisio-signature"]).toBeDefined(); // HMAC generated
      expect(postArgs[2]?.headers?.["x-idempotency-key"]).toBe("del-1-0");

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

      const delivery = {
        id: "del-2",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 1, // 1 past attempt
        user: {},
      };

      await service.deliver(delivery);

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockPrismaService.webhookDelivery.update).toHaveBeenCalledTimes(1);

      const updateCall =
        mockPrismaService.webhookDelivery.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe("del-2");
      expect(updateCall.data.attempts).toBe(2);
      expect(updateCall.data.status).toBeUndefined(); // Still 'pending' since not 5 retries
      expect(updateCall.data.nextAttemptAt).toBeInstanceOf(Date);
    });

    it("should mark as failed permanently after 5 attempts", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Network Error"));

      const delivery = {
        id: "del-max",
        url: "https://example.com/webhook",
        payload: { status: "paid" },
        attempts: 4, // meaning this attempt is the 5th
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
