import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";

import request from "supertest";

import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

import { JwtAuthGuard } from "src/auth/guard/auth.guard";
import { MerchantMembershipGuard } from "src/common/gaurds/merchant-membership.guard";
import { MerchantRolesGuard } from "src/common/gaurds/merchant-roles.guard";

describe("MerchantController RBAC", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MerchantController],

      providers: [
        {
          provide: MerchantService,
          useValue: {},
        },

        JwtAuthGuard,
        MerchantMembershipGuard,
        MerchantRolesGuard,
      ],
    }).compile();

    app = module.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
});
