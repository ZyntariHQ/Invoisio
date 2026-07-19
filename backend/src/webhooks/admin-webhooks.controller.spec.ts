import { Test, TestingModule } from "@nestjs/testing";
import { AdminWebhooksController } from "./admin-webhooks.controller";
import { WebhooksService } from "./webhooks.service";

describe("AdminWebhooksController", () => {
  let controller: AdminWebhooksController;

  const mockWebhooksService = {
    listDeadLetters: jest.fn(),
    getDeadLetter: jest.fn(),
    retryDeadLetter: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminWebhooksController],
      providers: [{ provide: WebhooksService, useValue: mockWebhooksService }],
    }).compile();

    controller = module.get<AdminWebhooksController>(AdminWebhooksController);
  });

  it("lists dead-letter jobs", async () => {
    mockWebhooksService.listDeadLetters.mockResolvedValue([{ id: "dlq-1" }]);

    const result = await controller.listDeadLetters({
      status: "pending_retry" as any,
      limit: 20,
    });

    expect(result).toEqual([{ id: "dlq-1" }]);
    expect(mockWebhooksService.listDeadLetters).toHaveBeenCalledWith({
      status: "pending_retry",
      limit: 20,
    });
  });

  it("returns a single dead-letter job", async () => {
    mockWebhooksService.getDeadLetter.mockResolvedValue({ id: "dlq-2" });

    const result = await controller.getDeadLetter("dlq-2");

    expect(result).toEqual({ id: "dlq-2" });
    expect(mockWebhooksService.getDeadLetter).toHaveBeenCalledWith("dlq-2");
  });

  it("queues a retry for a dead-letter job", async () => {
    mockWebhooksService.retryDeadLetter.mockResolvedValue({
      deadLetterId: "dlq-3",
      deliveryId: "del-3",
      status: "requeued",
    });

    const result = await controller.retryDeadLetter("dlq-3");

    expect(result).toEqual({
      deadLetterId: "dlq-3",
      deliveryId: "del-3",
      status: "requeued",
    });
    expect(mockWebhooksService.retryDeadLetter).toHaveBeenCalledWith("dlq-3");
  });
});
