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
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";

/**
 * MerchantProfileAliasController
 * Deprecated alias controller re-routing legacy calls from `/merchant/profile`
 * to the consolidated `MerchantsService` logic for backwards compatibility.
 */
@Controller("merchant/profile")
@UseGuards(MerchantRolesGuard)
export class MerchantProfileAliasController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /merchant/profile
   * Deprecated alias for GET /merchants/profile.
   */
  @Auth()
  @Get()
  async getProfile(@CurrentUser() user: User) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.findProfile(user.merchantId),
    );
  }

  /**
   * PUT /merchant/profile
   * Deprecated alias for PUT /merchants/profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @Put()
  async upsertProfile(
    @CurrentUser() user: User,
    @Body() dto: UpsertMerchantProfileDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.upsertProfile(user.merchantId, dto),
    );
  }

  /**
   * PATCH /merchant/profile
   * Deprecated alias for PATCH /merchants/profile.
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @Patch()
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateMerchantProfileDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.updateProfile(user.merchantId, dto),
    );
  }
}
