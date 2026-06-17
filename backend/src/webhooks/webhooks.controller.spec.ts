import { Test, TestingModule } from "@nestjs/testing";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";

describe("WebhooksController", () => {
  let controller: WebhooksController;

  const mockWebhooksService = {
    getWebhookSecretMetadata: jest.fn(),
    rotateWebhookSecret: jest.fn(),
  };

  const mockPrismaService = {
    runWithMerchantScope: jest.fn((_, callback) => callback()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it("returns masked secret metadata for the current user", async () => {
    mockWebhooksService.getWebhookSecretMetadata.mockResolvedValue({
      hasSecret: true,
      maskedSecret: "abcd...wxyz",
      secretLength: 64,
    });

    const result = await controller.getSecretMetadata({
      id: "user-1",
      merchantId: "merchant-1",
    } as any);

    expect(result).toEqual({
      hasSecret: true,
      maskedSecret: "abcd...wxyz",
      secretLength: 64,
    });
    expect(mockPrismaService.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-1",
      expect.any(Function),
    );
    expect(mockWebhooksService.getWebhookSecretMetadata).toHaveBeenCalledWith(
      "user-1",
      "merchant-1",
    );
  });

  it("rotates the webhook secret for the current user", async () => {
    mockWebhooksService.rotateWebhookSecret.mockResolvedValue({
      secret: "new-secret",
      metadata: {
        hasSecret: true,
        maskedSecret: "new-...cret",
        secretLength: 10,
      },
    });

    const result = await controller.rotateSecret({
      id: "user-2",
      merchantId: "merchant-2",
    } as any);

    expect(result.secret).toBe("new-secret");
    expect(result.metadata.maskedSecret).toBe("new-...cret");
    expect(mockPrismaService.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-2",
      expect.any(Function),
    );
    expect(mockWebhooksService.rotateWebhookSecret).toHaveBeenCalledWith(
      "user-2",
      "merchant-2",
    );
  });
});
