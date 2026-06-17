import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";

import request from "supertest";

import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

import { JwtAuthGuard } from "../auth/guard/auth.guard";
import { MerchantMembershipGuard } from "../common/guards/merchant-membership.guard";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";

describe("MerchantController RBAC", () => {
  let app: INestApplication;

  let currentRole = "viewer";

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantController],

      providers: [
        {
          provide: MerchantService,
          useValue: {},
        },
      ],
    })

      .overrideGuard(JwtAuthGuard)

      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();

          req.user = {
            id: "user-1",
          };

          return true;
        },
      })

      .overrideGuard(MerchantMembershipGuard)

      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();

          req.membership = {
            role: currentRole,
          };

          return true;
        },
      })

      .compile();

    app = module.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should deny viewer export access", async () => {
    currentRole = "viewer";

    await request(app.getHttpServer())
      .get("/merchants/1/export")

      .expect(403);
  });

  it("should deny viewer settings update", async () => {
    currentRole = "viewer";

    await request(app.getHttpServer())
      .patch("/merchants/1/settings")

      .expect(403);
  });

  it("should allow admin export", async () => {
    currentRole = "admin";

    await request(app.getHttpServer())
      .get("/merchants/1/export")

      .expect(200);
  });
});
