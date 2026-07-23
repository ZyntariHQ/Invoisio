import { Body, Controller, Get, Patch, Put } from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import {
  UpdateMerchantProfileDto,
  UpsertMerchantProfileDto,
} from "./dto/merchant-profile.dto";
import { MerchantProfile } from "./entities/merchant-profile.entity";
import { MerchantsService } from "./merchants.service";
import { PrismaService } from "../prisma/prisma.service";

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

  @Auth()
  @Put()
  upsertProfile(
    @CurrentUser() user: User,
    @Body() dto: UpsertMerchantProfileDto,
  ): Promise<MerchantProfile> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.merchantsService.upsertProfile(user.merchantId, dto),
    );
  }

  @Auth()
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
