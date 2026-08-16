import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

describe("MerchantController", () => {
  let app: INestApplication;
  let module: TestingModule;

  const mockMerchant = {
    id: "merchant-1",
    name: "Test Merchant",
    stellarPublicKey: "GABC123",
    payoutPublicKey: null,
    preferredAsset: "USDC",
    webhookUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMerchantService = {
    getProfile: jest.fn().mockResolvedValue(mockMerchant),
    updateSettings: jest.fn().mockResolvedValue({
      ...mockMerchant,
      name: "Updated Name",
      payoutPublicKey:
        "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
      preferredAsset: "EURC",
    }),
    updateChecklist: jest.fn().mockResolvedValue({ success: true }),
  };

  const auth = (user: {
    id?: string;
    merchantId?: string;
    role?: MerchantRole;
  }) => {
    const token = signUserToken(module as any, {
      id: user.id ?? "user-1",
      merchantId: user.merchantId ?? "merchant-1",
      role: user.role ?? MerchantRole.OWNER,
    });
    return `Bearer ${token}`;
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [MerchantController],
      imports: [...jwtAuthImports],
      providers: [
        { provide: MerchantService, useValue: mockMerchantService },
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /merchants/profile should return merchant profile for any authenticated role", async () => {
    const res = await request(app.getHttpServer())
      .get("/merchants/profile")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(200);

    expect(res.body).toMatchObject({
      id: "merchant-1",
      name: "Test Merchant",
      preferredAsset: "USDC",
    });
  });

  it("GET /merchants/profile should reject unauthenticated requests", async () => {
    await request(app.getHttpServer()).get("/merchants/profile").expect(401);
  });

  it("PATCH /merchants/settings should allow merchant owner", async () => {
    const res = await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.OWNER }))
      .send({
        name: "Updated Name",
        payoutPublicKey:
          "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        preferredAsset: "EURC",
      })
      .expect(200);

    expect(res.body.name).toBe("Updated Name");
    expect(res.body.preferredAsset).toBe("EURC");
  });

  it("PATCH /merchants/settings should allow merchant admin", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.ADMIN }))
      .send({ name: "Updated Name" })
      .expect(200);
  });

  it("PATCH /merchants/settings should forbid viewer", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .send({ name: "Nope" })
      .expect(403);
  });

  it("PATCH /merchants/settings should forbid operator", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
      .send({ name: "Nope" })
      .expect(403);
  });

  it("PATCH /merchants/settings should reject unauthenticated requests", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .send({ name: "Nope" })
      .expect(401);
  });

  it("PATCH /merchants/settings should reject invalid payout key", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.OWNER }))
      .send({ payoutPublicKey: "INVALID_KEY" })
      .expect(400);
  });

  it("PATCH /merchants/settings should reject invalid preferredAsset", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .set("Authorization", auth({ role: MerchantRole.OWNER }))
      .send({ preferredAsset: "DOGE" })
      .expect(400);
  });

  it("PATCH /merchants/checklist should allow operator", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/checklist")
      .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
      .send({ profileCompleted: true })
      .expect(200);
  });

  it("PATCH /merchants/checklist should forbid viewer", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/checklist")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .send({ profileCompleted: true })
      .expect(403);
  });

  it("PATCH /merchants/checklist/sync should forbid viewer", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/checklist/sync")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(403);
  });
});
