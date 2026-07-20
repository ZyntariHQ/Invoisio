import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

const mockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
  },
});

const mockConfigService = () => ({
  getOrThrow: jest.fn(() => "test-secret-at-least-32-chars-0123456789"),
});

describe("JwtStrategy (token revocation)", () => {
  it("accepts token when tokenVersion matches", async () => {
    const prisma = mockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      merchantId: "merchant-1",
      publicKey: "G....",
      createdAt: new Date(),
      updatedAt: new Date(),
      email: null,
      isAdmin: false,
      tokenVersion: 2,
    });

    const strategy = new JwtStrategy(prisma as any, mockConfigService() as any);

    const user = await strategy.validate({
      sub: "user-1",
      publicKey: "G....",
      merchantId: "merchant-1",
      tokenVersion: 2,
    });

    expect(user.id).toBe("user-1");
    expect(user.tokenVersion).toBe(2);
  });

  it("rejects token when tokenVersion is stale", async () => {
    const prisma = mockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      merchantId: "merchant-1",
      publicKey: "G....",
      createdAt: new Date(),
      updatedAt: new Date(),
      email: null,
      isAdmin: false,
      tokenVersion: 3,
    });

    const strategy = new JwtStrategy(prisma as any, mockConfigService() as any);

    await expect(
      strategy.validate({
        sub: "user-1",
        publicKey: "G....",
        merchantId: "merchant-1",
        tokenVersion: 2,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("treats missing tokenVersion as 0 (backward compatible)", async () => {
    const prisma = mockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      merchantId: "merchant-1",
      publicKey: "G....",
      createdAt: new Date(),
      updatedAt: new Date(),
      email: null,
      isAdmin: false,
      tokenVersion: 0,
    });

    const strategy = new JwtStrategy(prisma as any, mockConfigService() as any);

    await expect(
      strategy.validate({
        sub: "user-1",
        publicKey: "G....",
        merchantId: "merchant-1",
      } as any),
    ).resolves.toBeTruthy();
  });

  it("rejects missing tokenVersion when user has logged out (tokenVersion > 0)", async () => {
    const prisma = mockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      merchantId: "merchant-1",
      publicKey: "G....",
      createdAt: new Date(),
      updatedAt: new Date(),
      email: null,
      isAdmin: false,
      tokenVersion: 1,
    });

    const strategy = new JwtStrategy(prisma as any, mockConfigService() as any);

    await expect(
      strategy.validate({
        sub: "user-1",
        publicKey: "G....",
        merchantId: "merchant-1",
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
