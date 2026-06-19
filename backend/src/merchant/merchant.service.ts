import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMerchantProfileDto } from "./dtos/update-merchant-profile.dto";

@Injectable()
export class MerchantService {
  constructor(private prisma: PrismaService) {}

  async getProfile(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        stellarPublicKey: true,
        businessEmail: true,
        preferredAsset: true,
        payoutWallet: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return merchant;
  }

  async updateProfile(merchantId: string, data: UpdateMerchantProfileDto) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return this.prisma.merchant.update({
      where: { id: merchantId },
      data,
    });
  }
}
