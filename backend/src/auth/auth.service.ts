import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as crypto from "crypto";
import * as StellarSdk from "@stellar/stellar-sdk";
import { NonceRequestDto, VerifyRequestDto } from "./dtos/auth.dto";

const NONCE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const NONCE_REGENERATION_GRACE_MS = 0; // immediate invalidation on regeneration

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Generate and store a random nonce for a Stellar public key.
   * Creates the user record if it does not exist yet.
   * Any previous nonce is immediately invalidated (replay protection).
   */
  async generateNonce(
    dto: NonceRequestDto,
  ): Promise<{ nonce: string; expiresAt: number }> {
    this.assertValidPublicKey(dto.publicKey);

    const existing = await this.prisma.user.findUnique({
      where: { publicKey: dto.publicKey },
    });

    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = BigInt(Date.now() + NONCE_TTL_MS);

    if (existing) {
      if (!existing.merchantId) {
        await this.prisma.merchant.upsert({
          where: { stellarPublicKey: dto.publicKey },
          create: {
            id: existing.id,
            name: existing.email || `Merchant ${dto.publicKey.slice(0, 6)}`,
            stellarPublicKey: dto.publicKey,
            webhookUrl: existing.webhookUrl ?? null,
          },
          update: {},
        });

        await this.prisma.user.update({
          where: { publicKey: dto.publicKey },
          data: { merchantId: existing.id },
        });
      }
    } else {
      const merchantId = crypto.randomUUID();
      await this.prisma.merchant.create({
        data: {
          id: merchantId,
          name: `Merchant ${dto.publicKey.slice(0, 6)}`,
          stellarPublicKey: dto.publicKey,
          webhookUrl: null,
        },
      });

      await this.prisma.user.create({
        data: {
          publicKey: dto.publicKey,
          nonce,
          nonceExpiresAt: expiresAt,
          nonceUsedAt: null,
          merchantId,
        },
      });
      return { nonce, expiresAt: Number(expiresAt) };
    }

    await this.prisma.user.update({
      where: { publicKey: dto.publicKey },
      data: {
        nonce,
        nonceExpiresAt: expiresAt,
        nonceUsedAt: null,
      },
    });

    return { nonce, expiresAt: Number(expiresAt) };
  }

  /**
   * Verify a signed nonce and issue a JWT.
   * Check order is intentional:
   *   1. user existence  → UnauthorizedException
   *   2. replay guard    → UnauthorizedException
   *   3. expiry          → UnauthorizedException
   *   4. format check    → BadRequestException  (only reached with a real nonce)
   *   5. crypto verify   → UnauthorizedException
   */
  async verify(dto: VerifyRequestDto): Promise<{ accessToken: string }> {
    this.assertValidPublicKey(dto.publicKey);

    // 1. Find user — unauthorized if no record or no active nonce
    const user = await this.prisma.user.findUnique({
      where: { publicKey: dto.publicKey },
    });

    if (!user || !user.nonce) {
      throw new UnauthorizedException(
        "No active nonce found. Request a new nonce first.",
      );
    }

    // 2. Replay guard — unauthorized if nonce already consumed
    if (user.nonceUsedAt != null) {
      throw new UnauthorizedException(
        "Nonce has already been used. Request a new nonce.",
      );
    }

    // 3. Expiry — unauthorized if nonce has expired
    if (Date.now() > Number(user.nonceExpiresAt ?? 0n)) {
      throw new UnauthorizedException(
        "Nonce has expired. Request a new nonce.",
      );
    }

    // 4. Format check — bad request only if payload is structurally invalid
    this.assertValidSignatureFormat(dto.signedNonce);

    // 5. Cryptographic verification — unauthorized if signature doesn't match
    this.verifySignature(dto.publicKey, user.nonce, dto.signedNonce);

    await this.prisma.user.update({
      where: { publicKey: dto.publicKey },
      data: {
        nonce: null,
        nonceExpiresAt: null,
        nonceUsedAt: new Date(),
      },
    });

    const payload = {
      sub: user.id,
      publicKey: user.publicKey,
      merchantId: user.merchantId,
    };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private assertValidPublicKey(publicKey: string): void {
    try {
      StellarSdk.Keypair.fromPublicKey(publicKey);
    } catch {
      throw new BadRequestException("Invalid Stellar public key.");
    }
  }

  private assertValidSignatureFormat(signedNonce: string): void {
    if (
      !/^[A-Za-z0-9+/]+=*$/.test(signedNonce) ||
      signedNonce.length < 64 ||
      signedNonce.length > 128
    ) {
      throw new BadRequestException(
        "Malformed signature payload. The signed data must be valid base64.",
      );
    }
  }

  private verifySignature(
    publicKey: string,
    nonce: string,
    signedNonce: string,
  ): void {
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const messageBuffer = Buffer.from(nonce, "utf-8");
      const signatureBuffer = Buffer.from(signedNonce, "base64");

      if (signatureBuffer.length !== 64) {
        throw new Error("Decoded signature must be 64 bytes (EdDSA).");
      }

      const valid = keypair.verify(messageBuffer, signatureBuffer);
      if (!valid) {
        throw new Error("Signature mismatch");
      }
    } catch {
      throw new UnauthorizedException("Signature verification failed.");
    }
  }
}