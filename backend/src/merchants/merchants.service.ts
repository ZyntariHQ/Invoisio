import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  UpdateMerchantProfileDto,
  UpsertMerchantProfileDto,
} from "./dto/merchant-profile.dto";
import { MerchantProfile } from "./entities/merchant-profile.entity";
import { StellarValidator } from "../stellar/utils/stellar.validator";

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findProfile(merchantId: string): Promise<MerchantProfile> {
    return this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
    });
  }

  async upsertProfile(
    merchantId: string,
    dto: UpsertMerchantProfileDto,
  ): Promise<MerchantProfile> {
    this.assertValidPayoutWallet(dto.payoutWallet);

    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        name: dto.name,
        businessEmail: dto.businessEmail,
        preferredAsset: this.normalizeAsset(dto.preferredAsset),
        payoutWallet: dto.payoutWallet,
      },
    });
  }

  async updateProfile(
    merchantId: string,
    dto: UpdateMerchantProfileDto,
  ): Promise<MerchantProfile> {
    if (dto.payoutWallet !== undefined) {
      this.assertValidPayoutWallet(dto.payoutWallet);
    }

    const data: Prisma.MerchantUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.businessEmail !== undefined) data.businessEmail = dto.businessEmail;
    if (dto.preferredAsset !== undefined) {
      data.preferredAsset = this.normalizeAsset(dto.preferredAsset);
    }
    if (dto.payoutWallet !== undefined) data.payoutWallet = dto.payoutWallet;

    return this.prisma.merchant.update({
      where: { id: merchantId },
      data,
    });
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
}
