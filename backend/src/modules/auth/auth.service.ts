import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async connectWallet(connectWalletDto: ConnectWalletDto) {
    // Verify signature here (simplified for now)
    const user = await this.prisma.user.upsert({
      where: { walletAddress: connectWalletDto.walletAddress },
      update: {},
      create: {
        walletAddress: connectWalletDto.walletAddress,
      },
    });

    const payload = { sub: user.id, walletAddress: user.walletAddress };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
      },
    };
  }

  async disconnectWallet() {
    return { success: true };
  }

  async getWalletStatus() {
    return { connected: true };
  }

  async verifySignature(verifySignatureDto: VerifySignatureDto) {
    // Implement signature verification logic here
    // For now, returning a mock response
    return { valid: true };
  }
}