import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";
import { JwtAuthGuard } from "../auth/guard/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

describe("MerchantController", () => {
  let app: INestApplication;

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
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantController],
      providers: [
        { provide: MerchantService, useValue: mockMerchantService },
        {
          provide: PrismaService,
          useValue: {
            runWithMerchantScope: (_id: string, cb: () => unknown) => cb(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: "user-1", merchantId: "merchant-1" };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /merchants/profile should return merchant profile", async () => {
    const res = await request(app.getHttpServer())
      .get("/merchants/profile")
      .expect(200);

    expect(res.body).toMatchObject({
      id: "merchant-1",
      name: "Test Merchant",
      preferredAsset: "USDC",
    });
  });

  it("PATCH /merchants/settings should update settings", async () => {
    const res = await request(app.getHttpServer())
      .patch("/merchants/settings")
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

  it("PATCH /merchants/settings should reject invalid payout key", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .send({ payoutPublicKey: "INVALID_KEY" })
      .expect(400);
  });

  it("PATCH /merchants/settings should reject invalid preferredAsset", async () => {
    await request(app.getHttpServer())
      .patch("/merchants/settings")
      .send({ preferredAsset: "DOGE" })
      .expect(400);
  });
});
