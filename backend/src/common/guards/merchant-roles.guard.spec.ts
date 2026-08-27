import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";
import { MerchantRolesGuard } from "./merchant-roles.guard";
import { MerchantRole } from "../enums/merchant-role.enum";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { SetMetadata } from "@nestjs/common";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../../auth/guard/auth-testing.util";

function makeHandler(roles?: MerchantRole[]) {
  const fn = () => {};
  if (roles) {
    SetMetadata(ROLES_KEY, roles)(fn);
  }
  return fn;
}

function makeContext(request: any, roles?: MerchantRole[]): ExecutionContext {
  const handler = makeHandler(roles);
  return {
    getHandler: () => handler,
    getClass: () => MerchantRolesGuard,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe("MerchantRolesGuard", () => {
  let module: TestingModule;
  let guard: MerchantRolesGuard;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [...jwtAuthImports],
      providers: [...jwtAuthProviders, MerchantRolesGuard],
    }).compile();

    guard = module.get(MerchantRolesGuard);
  });

  afterAll(async () => {
    await module.close();
  });

  const bearer = (user: { role: MerchantRole; merchantId?: string }) => {
    const token = signUserToken(module as any, {
      id: "user-1",
      merchantId: user.merchantId ?? "merchant-1",
      role: user.role,
    });
    return { headers: { authorization: `Bearer ${token}` } };
  };

  it("allows a user whose role is in the required roles", async () => {
    const req = bearer({ role: MerchantRole.OWNER });
    await expect(
      guard.canActivate(
        makeContext(req, [MerchantRole.OWNER, MerchantRole.ADMIN]),
      ),
    ).resolves.toBe(true);
  });

  it("allows a user when no roles are required on the route", async () => {
    const req = bearer({ role: MerchantRole.VIEWER });
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
  });

  it("rejects a user whose role is not in the required roles", async () => {
    const req = bearer({ role: MerchantRole.VIEWER });
    await expect(
      guard.canActivate(makeContext(req, [MerchantRole.OWNER])),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects unauthenticated requests", async () => {
    const req = { headers: {} };
    await expect(
      guard.canActivate(makeContext(req, [MerchantRole.OWNER])),
    ).rejects.toThrow(UnauthorizedException);
  });
});
