import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import {
  UpdateMerchantProfileDto,
  UpsertMerchantProfileDto,
} from "./dto/merchant-profile.dto";
import { UpdateMerchantSettingsDto } from "./dto/update-merchant-settings.dto";
import { UpdateChecklistDto } from "./dto/update-checklist.dto";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";

/**
 * MerchantsController
 * Primary controller exposing merchant profile, settings, and checklist management endpoints.
 * Base route: /merchants
 */
@Controller("merchants")
@UseGuards(MerchantRolesGuard)
export class MerchantsController {
  constructor(
    private readonly merchantsService: MerchantsService,
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
      this.merchantsService.getProfile(user.merchantId),
    );
  }

  /**
   * PUT /merchants/profile
   * Creates or replaces the merchant profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @Put("profile")
  async upsertProfile(
    @CurrentUser() user: User,
    @Body() dto: UpsertMerchantProfileDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.upsertProfile(user.merchantId, dto),
    );
  }

  /**
   * PATCH /merchants/profile
   * Updates partial merchant profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @Patch("profile")
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.updateProfile(user.merchantId, dto),
    );
  }

  /**
   * PATCH /merchants/settings
   * Updates merchant settings (name, payout key, preferred asset, webhook).
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @Patch("settings")
  async updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.updateSettings(user.merchantId, dto),
    );
  }

  /**
   * GET /merchants/checklist
   * Returns the activation checklist for the authenticated merchant.
   */
  @Auth()
  @Get("checklist")
  async getChecklist(@CurrentUser() user: User) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.getChecklist(user.merchantId),
    );
  }

  /**
   * PATCH /merchants/checklist
   * Updates checklist completion status.
   * Restricted to merchant OWNERs, ADMINs and OPERATORs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN, MerchantRole.OPERATOR)
  @Patch("checklist")
  async updateChecklist(
    @CurrentUser() user: User,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.updateChecklist(user.merchantId, dto),
    );
  }

  /**
   * PATCH /merchants/checklist/sync
   * Syncs checklist based on current merchant state.
   * Restricted to merchant OWNERs, ADMINs and OPERATORs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN, MerchantRole.OPERATOR)
  @Patch("checklist/sync")
  async syncChecklist(@CurrentUser() user: User) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.syncChecklist(user.merchantId),
    );
  }
}
