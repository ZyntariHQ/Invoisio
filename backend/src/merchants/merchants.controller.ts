import { Body, Controller, Get, Patch, Put, UseGuards } from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import {
  UpdateMerchantProfileDto,
  UpsertMerchantProfileDto,
} from "./dto/merchant-profile.dto";
import { MerchantProfile } from "./entities/merchant-profile.entity";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";

@Controller("merchant/profile")
export class MerchantsController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly prisma: PrismaService,
  ) {}

  @Auth()
  @Get()
  getProfile(@CurrentUser() user: User): Promise<MerchantProfile> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.findProfile(user.merchantId),
    );
  }

  /**
   * PUT /merchant/profile
   * Creates or replaces the merchant profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Put()
  upsertProfile(
    @CurrentUser() user: User,
    @Body() dto: UpsertMerchantProfileDto,
  ): Promise<MerchantProfile> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.upsertProfile(user.merchantId, dto),
    );
  }

  /**
   * PATCH /merchant/profile
   * Updates the merchant profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Patch()
  updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateMerchantProfileDto,
  ): Promise<MerchantProfile> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.updateProfile(user.merchantId, dto),
    );
  }
}
