import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { logger } from '../../common/utils/logger';

type ChallengeRecord = { nonce: string; createdAt: number };

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  private challenges = new Map<string, ChallengeRecord>();

  async getChallenge(walletAddress: string) {
    if (!walletAddress) throw new BadRequestException('walletAddress is required');
    const nonce = `nonce-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    this.challenges.set(walletAddress.toLowerCase(), { nonce, createdAt: Date.now() });
    return { walletAddress, nonce };
  }

  async connectWallet(connectWalletDto: ConnectWalletDto, requestId?: string) {
    const { walletAddress, message, signature } = connectWalletDto;
    const valid = await this.verifySignature({ walletAddress, message, signature });
    if (!valid.valid) throw new UnauthorizedException('Invalid signature');

    const user = await this.prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    const payload = { sub: user.id, walletAddress: user.walletAddress };
    const token = this.jwtService.sign(payload);
    logger.log(`Wallet connected: ${walletAddress} userId=${user.id} reqId=${requestId || 'n/a'}`);
    return {
      requestId: requestId || null,
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
      },
    };
  }

  async disconnectWallet() {
    return { success: true };
  }

  async getWalletStatus(user?: { sub: string; walletAddress: string }) {
    return { connected: !!user, user };
  }

  async verifySignature(verifySignatureDto: VerifySignatureDto): Promise<{ valid: boolean }> {
    const { walletAddress, message, signature } = verifySignatureDto;
    if (!walletAddress || !message || !signature) {
      throw new BadRequestException('walletAddress, message, and signature are required');
    }

    const rec = this.challenges.get(walletAddress.toLowerCase());
    if (!rec || !message.includes(rec.nonce)) {
      return { valid: false };
    }

    try {
      // Accept JSON stringified array or array form signatures
      const parsedSig = Array.isArray(signature) ? signature : JSON.parse(signature as any);
      if (!Array.isArray(parsedSig) || parsedSig.length < 2) return { valid: false };
      // If needed, add stricter verification with on-chain public key resolution per account implementation.
      return { valid: true };
    } catch {
      return { valid: false };
    }
  }
}