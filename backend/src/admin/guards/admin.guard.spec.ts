import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
  let guard: AdminGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
    reflector = module.get<Reflector>(Reflector);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  describe("canActivate", () => {
    it("should allow access when route is marked as public", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);

      const context = createMockContext({ publicKey: "test" });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith("isPublic", [
        expect.anything(),
        expect.anything(),
      ]);
    });

    it("should throw ForbiddenException when user is not present", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockContext(null);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        "Authentication required.",
      );
    });

    it("should throw ForbiddenException when user publicKey does not match MERCHANT_PUBLIC_KEY", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockConfigService.get.mockReturnValue("GA_ADMIN_KEY");

      const context = createMockContext({
        publicKey: "GA_USER_KEY",
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow("Admin access required.");
    });

    it("should allow access when user publicKey matches MERCHANT_PUBLIC_KEY", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockConfigService.get.mockReturnValue("GA_ADMIN_KEY");

      const context = createMockContext({
        publicKey: "GA_ADMIN_KEY",
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("should throw ForbiddenException when MERCHANT_PUBLIC_KEY is not configured", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockConfigService.get.mockReturnValue(undefined);

      const context = createMockContext({
        publicKey: "GA_ANY_KEY",
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow("Admin access required.");
    });

    it("should throw ForbiddenException for non-admin user accessing admin route", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      // Set a specific admin key
      const adminKey = "GABCD1234567890";
      mockConfigService.get.mockReturnValue(adminKey);

      // User has a different key
      const context = createMockContext({
        publicKey: "GXYZA9876543210",
      });

      expect(() => guard.canActivate(context)).toThrow(
        "Admin access required.",
      );
    });

    it("should allow access for admin user", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const adminKey = "GADMIN1234567890";
      mockConfigService.get.mockReturnValue(adminKey);

      const context = createMockContext({
        publicKey: "GADMIN1234567890",
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
