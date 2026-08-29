import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { MerchantWebhookDeliveriesController } from "./merchant-webhook-deliveries.controller";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests (controller-level, no HTTP)
// ─────────────────────────────────────────────────────────────────────────────

describe("MerchantWebhookDeliveriesController (unit)", () => {
  let controller: MerchantWebhookDeliveriesController;

  const mockWebhooksService = {
    listMerchantDeliveries: jest.fn(),
    listMerchantDeadLetters: jest.fn(),
    retryMerchantDeadLetter: jest.fn(),
  };

  const mockPrismaService = {
    runWithMerchantScope: jest.fn((_id: string, cb: () => unknown) => cb()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantWebhookDeliveriesController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<MerchantWebhookDeliveriesController>(
      MerchantWebhookDeliveriesController,
    );
  });

  it("lists deliveries for the current merchant", async () => {
    const expected = [{ id: "del-1" }];
    mockWebhooksService.listMerchantDeliveries.mockResolvedValue(expected);

    const result = await controller.listDeliveries(
      { id: "user-1", merchantId: "merchant-1" } as any,
      {},
    );

    expect(result).toEqual(expected);
    expect(mockPrismaService.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-1",
      expect.any(Function),
    );
    expect(mockWebhooksService.listMerchantDeliveries).toHaveBeenCalledWith(
      "merchant-1",
      {},
    );
  });

  it("lists dead letters for the current merchant", async () => {
    const expected = [{ id: "dlq-1" }];
    mockWebhooksService.listMerchantDeadLetters.mockResolvedValue(expected);

    const result = await controller.listDeadLetters(
      { id: "user-1", merchantId: "merchant-1" } as any,
      {},
    );

    expect(result).toEqual(expected);
    expect(mockWebhooksService.listMerchantDeadLetters).toHaveBeenCalledWith(
      "merchant-1",
      {},
    );
  });

  it("retries a dead letter for the current merchant", async () => {
    const expected = {
      deadLetterId: "dlq-1",
      deliveryId: "del-new",
      status: "requeued",
    };
    mockWebhooksService.retryMerchantDeadLetter.mockResolvedValue(expected);

    const result = await controller.retryDeadLetter(
      { id: "user-1", merchantId: "merchant-1" } as any,
      "dlq-1",
    );

    expect(result).toEqual(expected);
    expect(mockWebhooksService.retryMerchantDeadLetter).toHaveBeenCalledWith(
      "dlq-1",
      "merchant-1",
    );
  });

  it("propagates NotFoundException from the service when dead letter not found", async () => {
    mockWebhooksService.retryMerchantDeadLetter.mockRejectedValue(
      new NotFoundException("Dead-letter webhook not found."),
    );

    await expect(
      controller.retryDeadLetter(
        { id: "user-1", merchantId: "merchant-1" } as any,
        "nonexistent-id",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests (full NestJS HTTP stack — allow / deny paths)
// ─────────────────────────────────────────────────────────────────────────────

describe("MerchantWebhookDeliveriesController (HTTP role enforcement)", () => {
  let app: INestApplication;
  let module: TestingModule;

  const MERCHANT_A = "merchant-aaa";
  const MERCHANT_B = "merchant-bbb";
  const DEAD_LETTER_ID = "550e8400-e29b-41d4-a716-446655440000";

  const mockDeliveries = [
    { id: "del-1", invoiceId: "inv-1", status: "success" },
  ];
  const mockDeadLetters = [
    { id: DEAD_LETTER_ID, merchantId: MERCHANT_A, status: "pending_retry" },
  ];
  const mockRetryResult = {
    deadLetterId: DEAD_LETTER_ID,
    deliveryId: "del-new",
    status: "requeued",
  };

  const mockWebhooksService = {
    listMerchantDeliveries: jest.fn().mockResolvedValue(mockDeliveries),
    listMerchantDeadLetters: jest.fn().mockResolvedValue(mockDeadLetters),
    retryMerchantDeadLetter: jest.fn().mockResolvedValue(mockRetryResult),
  };

  const makeToken = (user: {
    id?: string;
    merchantId?: string;
    role?: MerchantRole;
  }) =>
    `Bearer ${signUserToken(module as any, {
      id: user.id ?? "user-1",
      merchantId: user.merchantId ?? MERCHANT_A,
      role: user.role ?? MerchantRole.OWNER,
    })}`;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [MerchantWebhookDeliveriesController],
      imports: [...jwtAuthImports],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        {
          provide: PrismaService,
          useValue: {
            runWithMerchantScope: (_id: string, cb: () => unknown) => cb(),
          },
        },
        ...jwtAuthProviders,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebhooksService.listMerchantDeliveries.mockResolvedValue(
      mockDeliveries,
    );
    mockWebhooksService.listMerchantDeadLetters.mockResolvedValue(
      mockDeadLetters,
    );
    mockWebhooksService.retryMerchantDeadLetter.mockResolvedValue(
      mockRetryResult,
    );
  });

  // ── GET /webhooks/deliveries ──────────────────────────────────────────────

  describe("GET /webhooks/deliveries", () => {
    it("allows an authenticated merchant owner", async () => {
      const res = await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .set("Authorization", makeToken({ role: MerchantRole.OWNER }))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe("del-1");
    });

    it("allows a merchant viewer (read-only access)", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .set("Authorization", makeToken({ role: MerchantRole.VIEWER }))
        .expect(200);
    });

    it("allows a merchant operator", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .set("Authorization", makeToken({ role: MerchantRole.OPERATOR }))
        .expect(200);
    });

    it("rejects unauthenticated requests with 401", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .expect(401);
    });

    it("scopes the query to the authenticated user's merchantId", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .set(
          "Authorization",
          makeToken({ merchantId: MERCHANT_A, role: MerchantRole.OWNER }),
        )
        .expect(200);

      expect(mockWebhooksService.listMerchantDeliveries).toHaveBeenCalledWith(
        MERCHANT_A,
        expect.any(Object),
      );
    });

    it("never passes merchant B's id when merchant A is authenticated", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries")
        .set(
          "Authorization",
          makeToken({ merchantId: MERCHANT_A, role: MerchantRole.OWNER }),
        )
        .expect(200);

      const calledWith =
        mockWebhooksService.listMerchantDeliveries.mock.calls[0][0];
      expect(calledWith).not.toBe(MERCHANT_B);
    });
  });

  // ── GET /webhooks/deliveries/dead-letters ─────────────────────────────────

  describe("GET /webhooks/deliveries/dead-letters", () => {
    it("allows an authenticated merchant owner", async () => {
      const res = await request(app.getHttpServer())
        .get("/webhooks/deliveries/dead-letters")
        .set("Authorization", makeToken({ role: MerchantRole.OWNER }))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it("allows a merchant viewer (read-only access)", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries/dead-letters")
        .set("Authorization", makeToken({ role: MerchantRole.VIEWER }))
        .expect(200);
    });

    it("rejects unauthenticated requests with 401", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries/dead-letters")
        .expect(401);
    });

    it("passes a status filter through to the service", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries/dead-letters?status=pending_retry")
        .set("Authorization", makeToken({ role: MerchantRole.OWNER }))
        .expect(200);

      expect(mockWebhooksService.listMerchantDeadLetters).toHaveBeenCalledWith(
        MERCHANT_A,
        expect.objectContaining({ status: "pending_retry" }),
      );
    });

    it("scopes the query to the authenticated user's merchantId", async () => {
      await request(app.getHttpServer())
        .get("/webhooks/deliveries/dead-letters")
        .set(
          "Authorization",
          makeToken({ merchantId: MERCHANT_A, role: MerchantRole.ADMIN }),
        )
        .expect(200);

      expect(mockWebhooksService.listMerchantDeadLetters).toHaveBeenCalledWith(
        MERCHANT_A,
        expect.any(Object),
      );
    });
  });

  // ── POST /webhooks/deliveries/dead-letters/:id/retry ─────────────────────

  describe("POST /webhooks/deliveries/dead-letters/:id/retry", () => {
    it("allows a merchant owner to retry", async () => {
      const res = await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set("Authorization", makeToken({ role: MerchantRole.OWNER }))
        .expect(200);

      expect(res.body.deadLetterId).toBe(DEAD_LETTER_ID);
      expect(res.body.status).toBe("requeued");
    });

    it("allows a merchant admin to retry", async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set("Authorization", makeToken({ role: MerchantRole.ADMIN }))
        .expect(200);
    });

    it("forbids a merchant viewer from retrying (403)", async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set("Authorization", makeToken({ role: MerchantRole.VIEWER }))
        .expect(403);
    });

    it("forbids a merchant operator from retrying (403)", async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set("Authorization", makeToken({ role: MerchantRole.OPERATOR }))
        .expect(403);
    });

    it("rejects unauthenticated requests with 401", async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .expect(401);
    });

    it("returns 400 when the service rejects a duplicate pending retry", async () => {
      mockWebhooksService.retryMerchantDeadLetter.mockRejectedValueOnce(
        new BadRequestException(
          "Dead-letter webhook is already queued for retry.",
        ),
      );

      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set("Authorization", makeToken({ role: MerchantRole.OWNER }))
        .expect(400);
    });

    it("returns 404 when the service rejects a cross-merchant ownership attempt", async () => {
      mockWebhooksService.retryMerchantDeadLetter.mockRejectedValueOnce(
        new NotFoundException("Dead-letter webhook not found."),
      );

      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set(
          "Authorization",
          makeToken({ merchantId: MERCHANT_B, role: MerchantRole.OWNER }),
        )
        .expect(404);
    });

    it("passes the authenticated merchantId (not a caller-supplied one) to the service", async () => {
      await request(app.getHttpServer())
        .post(`/webhooks/deliveries/dead-letters/${DEAD_LETTER_ID}/retry`)
        .set(
          "Authorization",
          makeToken({ merchantId: MERCHANT_A, role: MerchantRole.OWNER }),
        )
        .expect(200);

      expect(mockWebhooksService.retryMerchantDeadLetter).toHaveBeenCalledWith(
        DEAD_LETTER_ID,
        MERCHANT_A,
      );
    });
  });
});
