import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { MerchantsController } from "./merchants.controller";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { MerchantRole } from "../common/enums/merchant-role.enum";

describe("MerchantsController (merchant profile RBAC)", () => {
  let app: INestApplication;
  let module: TestingModule;

  const mockProfile = {
    id: "merchant-1",
    name: "Test Merchant",
    stellarPublicKey: "GABC123",
    businessEmail: "admin@example.com",
    preferredAsset: "USDC",
    payoutWallet: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMerchantsService = {
    findProfile: jest.fn().mockResolvedValue(mockProfile),
    upsertProfile: jest.fn().mockResolvedValue(mockProfile),
    updateProfile: jest.fn().mockResolvedValue({
      ...mockProfile,
      name: "Updated Name",
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
      controllers: [MerchantsController],
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
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /merchant/profile should allow viewer (read-only)", async () => {
    const res = await request(app.getHttpServer())
      .get("/merchant/profile")
      .set("Authorization", auth({ role: MerchantRole.VIEWER }))
      .expect(200);

    expect(res.body).toMatchObject({ id: "merchant-1" });
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
