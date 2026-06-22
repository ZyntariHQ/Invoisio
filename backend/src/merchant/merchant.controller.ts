import { Controller, Get, Patch, Body } from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { MerchantService } from "./merchant.service";
import { UpdateMerchantSettingsDto } from "./dto/update-merchant-settings.dto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * MerchantController
 * Exposes merchant profile and settings management endpoints.
 * All routes require JWT authentication; the merchant is scoped
 * to the authenticated user's merchantId.
 */
@Controller("merchants")
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /merchants/profile
   * Returns the merchant profile for the authenticated user.
   */
  @Auth()
  @Get("profile")
  async getProfile(@CurrentUser() user: User) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantService.getProfile(user.merchantId),
    );
  }

  /**
   * PATCH /merchants/settings
   * Updates merchant settings (name, payout key, preferred asset, webhook).
   * Validates Stellar public key format before persisting.
   */
  @Auth()
  @Patch("settings")
  async updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantService.updateSettings(user.merchantId, dto),
    );
  }
}
