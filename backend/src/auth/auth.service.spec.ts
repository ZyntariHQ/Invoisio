import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as StellarSdk from "@stellar/stellar-sdk";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

const mockPrisma = () => ({
  merchant: {
    create: jest.fn(),
    upsert: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

describe("AuthService", () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let jwtService: { sign: jest.Mock };

  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();

  beforeEach(async () => {
    jwtService = { sign: jest.fn(() => "jwt-token") };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: StructuredLogger,
          useValue: mockStructuredLogger,
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
  });

  describe("generateNonce", () => {
    it("creates user if not found and returns nonce", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.merchant.create.mockResolvedValue({ id: "merchant-id" });
      prisma.user.create.mockResolvedValue({ publicKey });

      const result = await service.generateNonce({ publicKey });
      expect(result.nonce).toHaveLength(64); // 32 bytes hex
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it("reuses existing user record and resets nonceUsedAt", async () => {
      const existing = {
        publicKey,
        nonce: "old-nonce",
        nonceExpiresAt: BigInt(Date.now() - 1000),
        nonceUsedAt: new Date(Date.now() - 1000),
        merchantId: "merchant-id",
      };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({});

      await service.generateNonce({ publicKey });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.merchant.upsert).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { publicKey },
        data: expect.objectContaining({ nonceUsedAt: null }),
      });
    });

    it("throws on invalid public key", async () => {
      await expect(
        service.generateNonce({ publicKey: "INVALID" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("verify", () => {
    it("issues a JWT when signature is valid", async () => {
      const nonce = "testnonce";
      const signature = keypair.sign(Buffer.from(nonce)).toString("base64");

      prisma.user.findUnique.mockResolvedValue({
        id: "user-id",
        merchantId: "merchant-id",
        publicKey,
        nonce,
        nonceExpiresAt: BigInt(Date.now() + 60_000),
        tokenVersion: 0,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.verify({
        publicKey,
        signedNonce: signature,
      });
      expect(result.accessToken).toBe("jwt-token");
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: "user-id",
          tokenVersion: 0,
        }),
      );
    });

    it("throws when nonce is expired", async () => {
      prisma.user.findUnique.mockResolvedValue({
        merchantId: "merchant-id",
        publicKey,
        nonce: "old",
        nonceExpiresAt: BigInt(Date.now() - 1000),
      });

      await expect(
        service.verify({ publicKey, signedNonce: "sig" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when signature is invalid", async () => {
      const nonce = "testnonce";
      // Valid base64, correct length, but not a real signature over `nonce`
      const fakeSignature = Buffer.alloc(64, 0).toString("base64");

      prisma.user.findUnique.mockResolvedValue({
        merchantId: "merchant-id",
        publicKey,
        nonce,
        nonceExpiresAt: BigInt(Date.now() + 60_000),
      });

      await expect(
        service.verify({ publicKey, signedNonce: fakeSignature }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when no nonce exists for user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.verify({ publicKey, signedNonce: "sig" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws on replay: nonce has been used before", async () => {
      const nonce = "testnonce";
      const signature = keypair.sign(Buffer.from(nonce)).toString("base64");

      prisma.user.findUnique.mockResolvedValue({
        id: "user-id",
        merchantId: "merchant-id",
        publicKey,
        nonce,
        nonceExpiresAt: BigInt(Date.now() + 60_000),
        nonceUsedAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verify({ publicKey, signedNonce: signature }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws on malformed base64 signature", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "user-id",
        merchantId: "merchant-id",
        publicKey,
        nonce: "testnonce",
        nonceExpiresAt: BigInt(Date.now() + 60_000),
        nonceUsedAt: null,
      });

      await expect(
        service.verify({ publicKey, signedNonce: "not-a-valid-base64!!!" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws on tampered signature (wrong nonce)", async () => {
      const correctNonce = "correctnonce";
      const tamperedNonce = "tamperednonce";
      const signature = keypair
        .sign(Buffer.from(tamperedNonce))
        .toString("base64");

      prisma.user.findUnique.mockResolvedValue({
        id: "user-id",
        merchantId: "merchant-id",
        publicKey,
        nonce: correctNonce,
        nonceExpiresAt: BigInt(Date.now() + 60_000),
        nonceUsedAt: null,
      });

      await expect(
        service.verify({ publicKey, signedNonce: signature }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("sets nonceUsedAt after successful verification", async () => {
      const nonce = "testnonce";
      const signature = keypair.sign(Buffer.from(nonce)).toString("base64");

      prisma.user.findUnique.mockResolvedValue({
        id: "user-id",
        merchantId: "merchant-id",
        publicKey,
        nonce,
        nonceExpiresAt: BigInt(Date.now() + 60_000),
        nonceUsedAt: null,
      });

      const updateMock = jest.fn().mockResolvedValue({});
      prisma.user.update.mockImplementation(updateMock);

      await service.verify({ publicKey, signedNonce: signature });
      expect(updateMock).toHaveBeenCalledWith({
        where: { publicKey },
        data: expect.objectContaining({
          nonce: null,
          nonceExpiresAt: null,
        }),
      });
      const updateArg = updateMock.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.nonceUsedAt).toBeInstanceOf(Date);
    });
  });

  describe("logout", () => {
    it("increments the user's tokenVersion to revoke active tokens", async () => {
      prisma.user.update.mockResolvedValue({});

      await service.logout("user-id");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-id" },
        data: expect.any(Object),
      });

      const call = prisma.user.update.mock.calls[0]?.[0];
      expect(call.data).toEqual({ tokenVersion: { increment: 1 } });
    });
  });
});
