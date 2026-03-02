import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as StellarSdk from "@stellar/stellar-sdk";
import { AuthService } from "./auth.service";
import { User } from "../users/user.entity";

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe("AuthService", () => {
  let service: AuthService;
  let repo: ReturnType<typeof mockRepo>;

  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: JwtService, useValue: { sign: jest.fn(() => "jwt-token") } },
      ],
    }).compile();

    service = module.get(AuthService);
    repo = module.get(getRepositoryToken(User));
  });

  describe("generateNonce", () => {
    it("creates user if not found and returns nonce", async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ publicKey });
      repo.save.mockResolvedValue({});

      const result = await service.generateNonce({ publicKey });
      expect(result.nonce).toHaveLength(64); // 32 bytes hex
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(repo.create).toHaveBeenCalledWith({ publicKey });
    });

    it("reuses existing user record", async () => {
      const existing = { publicKey, nonce: null, nonceExpiresAt: null };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({});

      await service.generateNonce({ publicKey });
      expect(repo.create).not.toHaveBeenCalled();
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

      repo.findOne.mockResolvedValue({
        id: "user-id",
        publicKey,
        nonce,
        nonceExpiresAt: Date.now() + 60_000,
      });
      repo.save.mockResolvedValue({});

      const result = await service.verify({
        publicKey,
        signedNonce: signature,
      });
      expect(result.accessToken).toBe("jwt-token");
    });

    it("throws when nonce is expired", async () => {
      repo.findOne.mockResolvedValue({
        publicKey,
        nonce: "old",
        nonceExpiresAt: Date.now() - 1000,
      });

      await expect(
        service.verify({ publicKey, signedNonce: "sig" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when signature is invalid", async () => {
      repo.findOne.mockResolvedValue({
        publicKey,
        nonce: "testnonce",
        nonceExpiresAt: Date.now() + 60_000,
      });

      await expect(
        service.verify({ publicKey, signedNonce: "badsignature" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws when no nonce exists for user", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.verify({ publicKey, signedNonce: "sig" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
