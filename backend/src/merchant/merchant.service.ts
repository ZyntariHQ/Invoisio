import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMerchantSettingsDto } from "./dto/update-merchant-settings.dto";

/**
 * MerchantService
 * Provides merchant profile and settings management.
 */
@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get merchant profile by merchant ID.
   * Returns the merchant record with relevant settings fields.
   */
  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        stellarPublicKey: true,
        payoutPublicKey: true,
        preferredAsset: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  /**
   * Update merchant settings (name, payout public key, preferred asset, webhook URL).
   * Validates the payout public key format before persisting.
   */
  async updateSettings(merchantId: string, dto: UpdateMerchantSettingsDto) {
    // Verify the merchant exists
    const existing = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!existing) {
      throw new NotFoundException("Merchant not found");
    }

    // Additional Stellar key validation beyond DTO regex (checksum-level)
    if (dto.payoutPublicKey) {
      try {
        const StellarSdk = await import("@stellar/stellar-sdk");
        StellarSdk.Keypair.fromPublicKey(dto.payoutPublicKey);
      } catch {
        throw new BadRequestException(
          "payoutPublicKey failed Stellar checksum validation",
        );
      }
    }

    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.payoutPublicKey !== undefined && {
          payoutPublicKey: dto.payoutPublicKey,
        }),
        ...(dto.preferredAsset !== undefined && {
          preferredAsset: dto.preferredAsset,
        }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
      },
      select: {
        id: true,
        name: true,
        stellarPublicKey: true,
        payoutPublicKey: true,
        preferredAsset: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }
}
