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
   *
   * When a name or preferredAsset is explicitly saved, the corresponding
   * "configuredAt" timestamp is stamped so the checklist can distinguish
   * intentional configuration from auto-generated defaults.
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

    const now = new Date();

    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(dto.name !== undefined && {
          name: dto.name,
          // Stamp the configuration timestamp so checklist knows this was
          // an intentional update, not an auto-generated placeholder.
          // If name is emptied, revoke the configuration timestamp.
          nameConfiguredAt: dto.name.trim().length > 0 ? now : null,
        }),
        ...(dto.payoutPublicKey !== undefined && {
          payoutWallet: dto.payoutPublicKey || null,
        }),
        ...(dto.preferredAsset !== undefined && {
          preferredAsset: dto.preferredAsset,
          // Same intent tracking for the asset choice.
          assetConfiguredAt: now,
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

    if (!allCompleted && updated.isCompleted) {
      return this.prisma.merchantActivationChecklist.update({
        where: { merchantId },
        data: {
          isCompleted: false,
          completedAt: null,
        },
      });
    }

    return updated;
  }

  /**
   * Auto-update checklist based on merchant state.
   *
   * Completion rules (intentional-configuration-only):
   *  - profileCompleted:          nameConfiguredAt is NOT NULL and name is non-empty
   *                               (name was explicitly saved, not the auto-generated placeholder)
   *  - assetPreferenceCompleted:  assetConfiguredAt is NOT NULL
   *                               (asset was explicitly chosen, not left at the schema default "XLM")
   *  - payoutKeyCompleted:        payoutWallet is NOT NULL and non-empty
   *  - firstInvoiceCompleted:     at least one invoice exists
   *
   * Reopening / Regression:
   *  - If previously completed steps become invalid/undone, completion is revoked:
   *    isCompleted is set to false and completedAt is cleared (null).
   */
  async syncChecklist(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { invoices: { take: 1 } },
    });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    const checklist = await this.getChecklist(merchantId);

    const targetProfileCompleted =
      merchant.nameConfiguredAt !== null &&
      merchant.name !== null &&
      merchant.name.trim().length > 0;
    const targetPayoutKeyCompleted =
      merchant.payoutWallet !== null && merchant.payoutWallet.trim().length > 0;
    const targetAssetPreferenceCompleted = merchant.assetConfiguredAt !== null;
    const targetFirstInvoiceCompleted = merchant.invoices.length > 0;

    const updates: Partial<{
      profileCompleted: boolean;
      payoutKeyCompleted: boolean;
      assetPreferenceCompleted: boolean;
      firstInvoiceCompleted: boolean;
    }> = {};

    if (checklist.profileCompleted !== targetProfileCompleted) {
      updates.profileCompleted = targetProfileCompleted;
    }

    if (checklist.payoutKeyCompleted !== targetPayoutKeyCompleted) {
      updates.payoutKeyCompleted = targetPayoutKeyCompleted;
    }

    if (checklist.assetPreferenceCompleted !== targetAssetPreferenceCompleted) {
      updates.assetPreferenceCompleted = targetAssetPreferenceCompleted;
    }

    if (checklist.firstInvoiceCompleted !== targetFirstInvoiceCompleted) {
      updates.firstInvoiceCompleted = targetFirstInvoiceCompleted;
    }

    const allCompleted =
      targetProfileCompleted &&
      targetPayoutKeyCompleted &&
      targetAssetPreferenceCompleted &&
      targetFirstInvoiceCompleted;

    // Only write to the DB when there are actual step changes or overall completion status is out of sync.
    if (
      Object.keys(updates).length > 0 ||
      checklist.isCompleted !== allCompleted
    ) {
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
