import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMerchantSettingsDto } from "./dto/update-merchant-settings.dto";
import { UpdateChecklistDto } from "./dto/update-checklist.dto";

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
        payoutWallet: true,
        preferredAsset: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return this.toSettingsResponse(merchant);
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
          payoutWallet: dto.payoutPublicKey,
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
        payoutWallet: true,
        preferredAsset: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.toSettingsResponse(updated);
  }

  /**
   * Get or create merchant activation checklist
   */
  async getChecklist(merchantId: string) {
    let checklist = await this.prisma.merchantActivationChecklist.findUnique({
      where: { merchantId },
    });

    // Create checklist if it doesn't exist
    if (!checklist) {
      checklist = await this.prisma.merchantActivationChecklist.create({
        data: { merchantId },
      });
    }

    return checklist;
  }

  /**
   * Update checklist completion status
   */
  async updateChecklist(merchantId: string, dto: UpdateChecklistDto) {
    const checklist = await this.prisma.merchantActivationChecklist.findUnique({
      where: { merchantId },
    });

    if (!checklist) {
      throw new NotFoundException("Checklist not found");
    }

    const updated = await this.prisma.merchantActivationChecklist.update({
      where: { merchantId },
      data: {
        ...(dto.profileCompleted !== undefined && {
          profileCompleted: dto.profileCompleted,
        }),
        ...(dto.payoutKeyCompleted !== undefined && {
          payoutKeyCompleted: dto.payoutKeyCompleted,
        }),
        ...(dto.assetPreferenceCompleted !== undefined && {
          assetPreferenceCompleted: dto.assetPreferenceCompleted,
        }),
        ...(dto.firstInvoiceCompleted !== undefined && {
          firstInvoiceCompleted: dto.firstInvoiceCompleted,
        }),
      },
    });

    // Check if all steps are completed
    const allCompleted =
      updated.profileCompleted &&
      updated.payoutKeyCompleted &&
      updated.assetPreferenceCompleted &&
      updated.firstInvoiceCompleted;

    if (allCompleted && !updated.isCompleted) {
      return this.prisma.merchantActivationChecklist.update({
        where: { merchantId },
        data: {
          isCompleted: true,
          completedAt: new Date(),
        },
      });
    }

    return updated;
  }

  /**
   * Auto-update checklist based on merchant state
   */
  async syncChecklist(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { invoices: true },
    });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    const checklist = await this.getChecklist(merchantId);

    const updates: any = {};

    // Profile is complete if name is set (beyond default)
    if (merchant.name && merchant.name.length > 0) {
      updates.profileCompleted = true;
    }

    // Payout key is complete if set
    if (merchant.payoutWallet) {
      updates.payoutKeyCompleted = true;
    }

    // Asset preference is complete if set (has default but check if explicitly set)
    if (merchant.preferredAsset) {
      updates.assetPreferenceCompleted = true;
    }

    // First invoice is complete if at least one invoice exists
    if (merchant.invoices.length > 0) {
      updates.firstInvoiceCompleted = true;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      return this.updateChecklist(merchantId, updates);
    }

    return checklist;
  }

  private toSettingsResponse<T extends { payoutWallet: string | null }>(
    merchant: T,
  ): Omit<T, "payoutWallet"> & { payoutPublicKey: string | null } {
    const { payoutWallet, ...rest } = merchant;
    return {
      ...rest,
      payoutPublicKey: payoutWallet,
    };
  }
}
