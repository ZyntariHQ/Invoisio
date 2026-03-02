import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import * as StellarSdk from "@stellar/stellar-sdk";
import { User } from "../users/user.entity";
import { NonceRequestDto, VerifyRequestDto } from "./dtos/auth.dto";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Generate and store a random nonce for a Stellar public key.
   * Creates the user record if it does not exist yet.
   */
  async generateNonce(
    dto: NonceRequestDto,
  ): Promise<{ nonce: string; expiresAt: number }> {
    this.assertValidPublicKey(dto.publicKey);

    let user = await this.userRepository.findOne({
      where: { publicKey: dto.publicKey },
    });

    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + NONCE_TTL_MS;

    if (!user) {
      user = this.userRepository.create({ publicKey: dto.publicKey });
    }

    user.nonce = nonce;
    user.nonceExpiresAt = expiresAt;
    await this.userRepository.save(user);

    return { nonce, expiresAt };
  }

  /**
   * Verify a signed nonce, create user if new, and issue a JWT.
   */
  async verify(dto: VerifyRequestDto): Promise<{ accessToken: string }> {
    this.assertValidPublicKey(dto.publicKey);

    const user = await this.userRepository.findOne({
      where: { publicKey: dto.publicKey },
    });

    if (!user || !user.nonce) {
      throw new UnauthorizedException(
        "No active nonce found. Request a new nonce first.",
      );
    }

    if (Date.now() > Number(user.nonceExpiresAt)) {
      throw new UnauthorizedException(
        "Nonce has expired. Request a new nonce.",
      );
    }

    this.verifySignature(dto.publicKey, user.nonce, dto.signedNonce);

    // Invalidate nonce after successful use (prevent replay attacks)
    user.nonce = "";
    user.nonceExpiresAt = null;
    await this.userRepository.save(user);

    const payload = { sub: user.id, publicKey: user.publicKey };
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

  private verifySignature(
    publicKey: string,
    nonce: string,
    signedNonce: string,
  ): void {
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const messageBuffer = Buffer.from(nonce, "utf-8");
      const signatureBuffer = Buffer.from(signedNonce, "base64");

      const valid = keypair.verify(messageBuffer, signatureBuffer);
      if (!valid) {
        throw new Error("Signature mismatch");
      }
    } catch {
      throw new UnauthorizedException("Signature verification failed.");
    }
  }
}
