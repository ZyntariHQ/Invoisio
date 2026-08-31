import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMerchantSettingsDto } from "./dto/update-merchant-settings.dto";
import { UpdateChecklistDto } from "./dto/update-checklist.dto";
import {
  UpdateMerchantProfileDto,
  UpsertMerchantProfileDto,
} from "./dto/merchant-profile.dto";
import { StellarValidator } from "../stellar/utils/stellar.validator";

/**
 * MerchantsService
 * Provides merchant profile, settings, and activation checklist management.
 */
@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get merchant profile by merchant ID.
   */
  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        stellarPublicKey: true,
        businessEmail: true,
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

    return this.toProfileResponse(merchant);
  }

  /**
   * Find profile by merchant ID (alias for getProfile / findUniqueOrThrow).
   */
  async findProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
    });
    return this.toProfileResponse(merchant);
  }

  /**
   * Update merchant settings (name, payout public key, preferred asset, webhook URL).
   */
  async updateSettings(merchantId: string, dto: UpdateMerchantSettingsDto) {
    const existing = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!existing) {
      throw new NotFoundException("Merchant not found");
    }

    if (dto.payoutPublicKey) {
      if (!StellarValidator.isValidPublicKey(dto.payoutPublicKey)) {
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
          nameConfiguredAt: dto.name.trim().length > 0 ? now : null,
        }),
        ...(dto.payoutPublicKey !== undefined && {
          payoutWallet: dto.payoutPublicKey || null,
        }),
        ...(dto.preferredAsset !== undefined && {
          preferredAsset: dto.preferredAsset,
          assetConfiguredAt: now,
        }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
      },
      select: {
        id: true,
        name: true,
        stellarPublicKey: true,
        businessEmail: true,
        payoutWallet: true,
        preferredAsset: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.toProfileResponse(updated);
  }

  /**
   * Creates or replaces the merchant profile.
   */
  async upsertProfile(merchantId: string, dto: UpsertMerchantProfileDto) {
    this.assertValidPayoutWallet(dto.payoutWallet);

    const now = new Date();
    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        name: dto.name,
        nameConfiguredAt: dto.name.trim().length > 0 ? now : null,
        businessEmail: dto.businessEmail,
        preferredAsset: this.normalizeAsset(dto.preferredAsset),
        assetConfiguredAt: now,
        payoutWallet: dto.payoutWallet,
      },
    });

    return this.toProfileResponse(updated);
  }

  /**
   * Updates partial merchant profile.
   */
  async updateProfile(merchantId: string, dto: UpdateMerchantProfileDto) {
    if (dto.payoutWallet !== undefined) {
      this.assertValidPayoutWallet(dto.payoutWallet);
    }

    const now = new Date();
    const data: Prisma.MerchantUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
      data.nameConfiguredAt = dto.name.trim().length > 0 ? now : null;
    }
    if (dto.businessEmail !== undefined) {
      data.businessEmail = dto.businessEmail;
    }
    if (dto.preferredAsset !== undefined) {
      data.preferredAsset = this.normalizeAsset(dto.preferredAsset);
      data.assetConfiguredAt = now;
    }
    if (dto.payoutWallet !== undefined) {
      data.payoutWallet = dto.payoutWallet;
    }

    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data,
    });

    return this.toProfileResponse(updated);
  }

  /**
   * Get or create merchant activation checklist.
   */
  async getChecklist(merchantId: string) {
    let checklist = await this.prisma.merchantActivationChecklist.findUnique({
      where: { merchantId },
    });

    if (!checklist) {
      checklist = await this.prisma.merchantActivationChecklist.create({
        data: { merchantId },
      });
    }

    return checklist;
  }

  /**
   * Update checklist completion status.
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

    if (
      Object.keys(updates).length > 0 ||
      checklist.isCompleted !== allCompleted
    ) {
      return this.updateChecklist(merchantId, updates);
    }

    return checklist;
  }

  private assertValidPayoutWallet(payoutWallet: string): void {
    if (!StellarValidator.isValidPublicKey(payoutWallet)) {
      throw new BadRequestException(
        "payoutWallet must be a valid Stellar public key",
      );
    }
  }

  private normalizeAsset(assetCode: string): string {
    return assetCode.toUpperCase();
  }

  private toProfileResponse<T extends { payoutWallet: string | null }>(
    merchant: T,
  ): T & { payoutPublicKey: string | null } {
    return {
      ...merchant,
      payoutPublicKey: merchant.payoutWallet,
    };
  }
}
