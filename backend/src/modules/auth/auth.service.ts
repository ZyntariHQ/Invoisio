import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { randomBytes } from 'crypto';
import { SiweMessage } from 'siwe';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}

  async requestNonce(walletAddress: string) {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const user = await this.prisma.user.upsert({
      where: { walletAddress },
      update: { nonce, nonceExpiresAt: expiresAt },
      create: {
        walletAddress,
        nonce,
        nonceExpiresAt: expiresAt,
      },
    });
    const chainId = parseInt(process.env.EVM_CHAIN_ID || '84532', 10);
    const domain = 'invoisio.app';
    return { nonce, expiresAt: user.nonceExpiresAt, chainId, domain };
  }

  async connectWallet(connectWalletDto: ConnectWalletDto) {
    const existing = await this.prisma.user.findUnique({ where: { walletAddress: connectWalletDto.walletAddress } });
    if (!existing || !existing.nonce) {
      throw new BadRequestException('Nonce required. Request nonce first.');
    }

    await this.verifySignature({
      walletAddress: connectWalletDto.walletAddress,
      signature: connectWalletDto.signature,
      message: connectWalletDto.message,
    });

    const user = await this.prisma.user.upsert({
      where: { walletAddress: connectWalletDto.walletAddress },
      update: { nonce: null, nonceExpiresAt: null },
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

    async loginByWallet(walletAddress: string) {
      walletAddress = walletAddress.toLowerCase();
  
      const user = await this.usersService.findOrCreateByWalletAddress(walletAddress);
  
      const payload = { sub: user.id, walletAddress };
      const accessToken = await this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '15m',
      });
      const refreshToken = await this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      });
  
      return { accessToken, refreshToken, user };
    }

    async refresh(refreshToken: string) {
      try {
        const payload = await this.jwtService.verifyAsync(refreshToken, {
          secret: this.config.get('JWT_REFRESH_SECRET'),
        });
  
        const accessToken = await this.jwtService.signAsync(
          { sub: payload.sub, walletAddress: payload.walletAddress },
          { secret: this.config.get('JWT_SECRET'), expiresIn: '15m' },
        );
  
        return { accessToken };
      } catch {
        throw new UnauthorizedException('Invalid refresh token');
      }
    }
  
    /**
     * Wallet status
     */
    getWalletStatus(user: any) {
      return { walletAddress: user.walletAddress, userId: user.userId };
    }

  async verifySignature(verifySignatureDto: VerifySignatureDto) {
    const { walletAddress, signature, message } = verifySignatureDto;

    const user = await this.prisma.user.findUnique({ where: { walletAddress } });
    if (!user || !user.nonce || !user.nonceExpiresAt) {
      throw new BadRequestException('Nonce not found. Request nonce first.');
    }
    if (new Date(user.nonceExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException('Nonce expired. Request a new nonce.');
    }

    let parsed: SiweMessage;
    try {
      parsed = new SiweMessage(message);
    } catch (e) {
      throw new BadRequestException('Invalid SIWE message');
    }

    if (!parsed.nonce || parsed.nonce !== user.nonce) {
      throw new BadRequestException('Nonce mismatch');
    }

    const expectedChainId = parseInt(process.env.EVM_CHAIN_ID || '84532', 10);
    if (parsed.chainId && parsed.chainId !== expectedChainId) {
      throw new BadRequestException('Invalid chain for signature');
    }

    const verification = await parsed.verify({ signature });
    if (!verification.success) {
      throw new BadRequestException('Signature invalid');
    }
    if (parsed.address?.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new BadRequestException('Address mismatch');
    }

    await this.prisma.user.update({
      where: { walletAddress },
      data: { nonce: null, nonceExpiresAt: null },
    });

    return { valid: true };
  }
}