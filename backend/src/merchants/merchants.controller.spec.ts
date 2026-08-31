import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { MerchantsController } from "./merchants.controller";
import { MerchantProfileAliasController } from "./merchant-profile-alias.controller";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

describe("MerchantsController & AliasController", () => {
  let app: INestApplication;
  let module: TestingModule;

  const mockProfile = {
    id: "merchant-1",
    name: "Test Merchant",
    stellarPublicKey: "GABC123",
    businessEmail: "admin@example.com",
    preferredAsset: "USDC",
    payoutWallet: null,
    payoutPublicKey: null,
    webhookUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMerchantsService = {
    getProfile: jest.fn().mockResolvedValue(mockProfile),
    findProfile: jest.fn().mockResolvedValue(mockProfile),
    upsertProfile: jest.fn().mockResolvedValue(mockProfile),
    updateProfile: jest.fn().mockResolvedValue({
      ...mockProfile,
      name: "Updated Name",
    }),
    updateSettings: jest.fn().mockResolvedValue({
      ...mockProfile,
      name: "Updated Name",
      payoutPublicKey:
        "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
      preferredAsset: "EURC",
    }),
    getChecklist: jest.fn().mockResolvedValue({ id: "checklist-1" }),
    updateChecklist: jest.fn().mockResolvedValue({ success: true }),
    syncChecklist: jest.fn().mockResolvedValue({ success: true }),
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
      controllers: [MerchantsController, MerchantProfileAliasController],
      imports: [...jwtAuthImports],
      providers: [
        { provide: MerchantsService, useValue: mockMerchantsService },
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

  describe("Primary Routes (/merchants/*)", () => {
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

    it("PUT /merchants/profile should allow owner & admin", async () => {
      await request(app.getHttpServer())
        .put("/merchants/profile")
        .set("Authorization", auth({ role: MerchantRole.ADMIN }))
        .send({
          name: "Test Merchant",
          businessEmail: "admin@example.com",
          preferredAsset: "USDC",
          payoutWallet:
            "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        })
        .expect(200);
    });

    it("PUT /merchants/profile should forbid operator", async () => {
      await request(app.getHttpServer())
        .put("/merchants/profile")
        .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
        .send({
          name: "Test Merchant",
          businessEmail: "admin@example.com",
          preferredAsset: "USDC",
          payoutWallet:
            "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        })
        .expect(403);
    });

    it("PATCH /merchants/profile should allow merchant owner", async () => {
      const res = await request(app.getHttpServer())
        .patch("/merchants/profile")
        .set("Authorization", auth({ role: MerchantRole.OWNER }))
        .send({ name: "Updated Name" })
        .expect(200);

      expect(res.body.name).toBe("Updated Name");
    });

    it("PATCH /merchants/profile should forbid viewer", async () => {
      await request(app.getHttpServer())
        .patch("/merchants/profile")
        .set("Authorization", auth({ role: MerchantRole.VIEWER }))
        .send({ name: "Nope" })
        .expect(403);
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

  describe("Deprecated Alias Routes (/merchant/profile)", () => {
    it("GET /merchant/profile should allow viewer (read-only)", async () => {
      const res = await request(app.getHttpServer())
        .get("/merchant/profile")
        .set("Authorization", auth({ role: MerchantRole.VIEWER }))
        .expect(200);

      expect(res.body).toMatchObject({ id: "merchant-1" });
    });

    it("GET /merchant/profile should reject unauthenticated requests", async () => {
      await request(app.getHttpServer()).get("/merchant/profile").expect(401);
    });

    it("PATCH /merchant/profile should allow merchant owner", async () => {
      const res = await request(app.getHttpServer())
        .patch("/merchant/profile")
        .set("Authorization", auth({ role: MerchantRole.OWNER }))
        .send({ name: "Updated Name" })
        .expect(200);

      expect(res.body.name).toBe("Updated Name");
    });

    it("PATCH /merchant/profile should forbid viewer", async () => {
      await request(app.getHttpServer())
        .patch("/merchant/profile")
        .set("Authorization", auth({ role: MerchantRole.VIEWER }))
        .send({ name: "Nope" })
        .expect(403);
    });

    it("PUT /merchant/profile should allow merchant admin", async () => {
      await request(app.getHttpServer())
        .put("/merchant/profile")
        .set("Authorization", auth({ role: MerchantRole.ADMIN }))
        .send({
          name: "Test Merchant",
          businessEmail: "admin@example.com",
          preferredAsset: "USDC",
          payoutWallet:
            "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        })
        .expect(200);
    });

    it("PUT /merchant/profile should forbid operator", async () => {
      await request(app.getHttpServer())
        .put("/merchant/profile")
        .set("Authorization", auth({ role: MerchantRole.OPERATOR }))
        .send({
          name: "Test Merchant",
          businessEmail: "admin@example.com",
          preferredAsset: "USDC",
          payoutWallet:
            "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        })
        .expect(403);
    });

    it("PUT /merchant/profile should reject unauthenticated requests", async () => {
      await request(app.getHttpServer())
        .put("/merchant/profile")
        .send({
          name: "Test Merchant",
          businessEmail: "admin@example.com",
          preferredAsset: "USDC",
          payoutWallet:
            "GCKFBEIYTKGLP4V4EMMZHHQVBNHGVTCNQJOWP4SUXFJTMW74VDAD5Z6R",
        })
        .expect(401);
    });
  });
});
