import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { randomBytes } from 'crypto';
import { SiweMessage } from 'siwe';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
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
    // Return EVM chain details for SIWE (Base chain defaults)
    const chainId = parseInt(process.env.EVM_CHAIN_ID || '84532', 10);
    const domain = 'invoisio.app';
    return { nonce, expiresAt: user.nonceExpiresAt, chainId, domain };
  }

  async connectWallet(connectWalletDto: ConnectWalletDto) {
    // Require prior nonce issuance
    const existing = await this.prisma.user.findUnique({ where: { walletAddress: connectWalletDto.walletAddress } });
    if (!existing || !existing.nonce) {
      throw new BadRequestException('Nonce required. Request nonce first.');
    }

    // Verify signature before connecting
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

  async getWalletStatus() {
    return { connected: true };
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

    // Verify SIWE message signature (EVM / Base chain)
    let parsed: SiweMessage;
    try {
      parsed = new SiweMessage(message);
    } catch (e) {
      throw new BadRequestException('Invalid SIWE message');
    }

    // Ensure nonce matches the one issued by the server
    if (!parsed.nonce || parsed.nonce !== user.nonce) {
      throw new BadRequestException('Nonce mismatch');
    }

    // Optional: enforce chainId if present
    const expectedChainId = parseInt(process.env.EVM_CHAIN_ID || '84532', 10);
    if (parsed.chainId && parsed.chainId !== expectedChainId) {
      throw new BadRequestException('Invalid chain for signature');
    }

    const verification = await parsed.verify({ signature });
    if (!verification.success) {
      throw new BadRequestException('Signature invalid');
    }
    // Ensure address matches the walletAddress provided
    if (parsed.address?.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new BadRequestException('Address mismatch');
    }

    // Clear nonce on success to prevent replay
    await this.prisma.user.update({
      where: { walletAddress },
      data: { nonce: null, nonceExpiresAt: null },
    });

    return { valid: true };
  }
}