import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

describe("WebhooksController", () => {
  let controller: WebhooksController;

  const mockWebhooksService = {
    getWebhookSecretMetadata: jest.fn(),
    rotateWebhookSecret: jest.fn(),
    sendTestDelivery: jest.fn(),
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

  it("sends a test delivery and returns the result", async () => {
    const testResult = {
      success: true,
      httpStatus: 200,
      durationMs: 123,
      failureReason: null,
      sentAt: "2026-08-16T22:00:00.000Z",
    };
    mockWebhooksService.sendTestDelivery.mockResolvedValue(testResult);

    const result = await controller.sendTestDelivery({
      id: "user-3",
      merchantId: "merchant-3",
    } as any);

    expect(result).toEqual(testResult);
    expect(mockPrismaService.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-3",
      expect.any(Function),
    );
    expect(mockWebhooksService.sendTestDelivery).toHaveBeenCalledWith(
      "user-3",
      "merchant-3",
    );
  });
});

describe("WebhooksController (role enforcement)", () => {
  let app: INestApplication;
  let module: TestingModule;

  const mockWebhooksService = {
    getWebhookSecretMetadata: jest.fn().mockResolvedValue({
      hasSecret: true,
      maskedSecret: "abcd...wxyz",
      secretLength: 64,
    }),
    rotateWebhookSecret: jest.fn().mockResolvedValue({
      secret: "new-secret",
      metadata: {
        hasSecret: true,
        maskedSecret: "new-...cret",
        secretLength: 10,
      },
    }),
    sendTestDelivery: jest.fn().mockResolvedValue({
      success: true,
      httpStatus: 200,
      durationMs: 50,
      failureReason: null,
      sentAt: "2026-08-16T22:00:00.000Z",
    }),
  };

  const auth = (user: { role?: MerchantRole }) => {
    const token = signUserToken(module as any, {
      id: "user-1",
      merchantId: "merchant-1",
      role: user.role ?? MerchantRole.OWNER,
    });
    return `Bearer ${token}`;
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [WebhooksController],
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

  it("POST /webhooks/secret/rotate should allow merchant owner", async () => {
    const res = await request(app.getHttpServer())
      .post("/webhooks/secret/rotate")
      .set("Authorization", auth({ role: MerchantRole.OWNER }))
      .expect(200);

    expect(res.body.secret).toBe("new-secret");
  });

  it("POST /webhooks/secret/rotate should allow merchant admin", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/secret/rotate")
      .set("Authorization", auth({ role: MerchantRole.ADMIN }))
      .expect(200);
  });

  it("POST /webhooks/secret/rotate should forbid viewer", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/secret/rotate")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(403);
  });

  it("POST /webhooks/secret/rotate should forbid operator", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/secret/rotate")
      .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
      .expect(403);
  });

  it("POST /webhooks/secret/rotate should reject unauthenticated requests", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/secret/rotate")
      .expect(401);
  });

  it("GET /webhooks/secret should allow viewer (read-only)", async () => {
    const res = await request(app.getHttpServer())
      .get("/webhooks/secret")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(200);

    expect(res.body.maskedSecret).toBe("abcd...wxyz");
  });

  // ── Test delivery role enforcement ───────────────────────────────────────

  it("POST /webhooks/test should allow merchant owner", async () => {
    const res = await request(app.getHttpServer())
      .post("/webhooks/test")
      .set("Authorization", auth({ role: MerchantRole.OWNER }))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.httpStatus).toBe(200);
    expect(typeof res.body.durationMs).toBe("number");
    expect(res.body.sentAt).toBeDefined();
  });

  it("POST /webhooks/test should allow merchant admin", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/test")
      .set("Authorization", auth({ role: MerchantRole.ADMIN }))
      .expect(200);
  });

  it("POST /webhooks/test should forbid viewer", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/test")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(403);
  });

  it("POST /webhooks/test should forbid operator", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/test")
      .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
      .expect(403);
  });

  it("POST /webhooks/test should reject unauthenticated requests", async () => {
    await request(app.getHttpServer()).post("/webhooks/test").expect(401);
  });
});
