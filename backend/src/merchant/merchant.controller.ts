import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  UseGuards,
  Param,
  Body,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guard/auth.guard";
import { MerchantMembershipGuard } from "../common/guards/merchant-membership.guard";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantService } from "./merchant.service";
import { UpdateMerchantProfileDto } from "./dtos/update-merchant-profile.dto";

@UseGuards(JwtAuthGuard, MerchantMembershipGuard, MerchantRolesGuard)
@Controller("merchants")
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get(":merchantId/profile")
  @Roles(
    MerchantRole.OWNER,
    MerchantRole.ADMIN,
    MerchantRole.OPERATOR,
    MerchantRole.VIEWER,
  )
  getProfile(@Param("merchantId") merchantId: string) {
    return this.merchantService.getProfile(merchantId);
  }

  @Patch(":merchantId/profile")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  updateProfile(
    @Param("merchantId") merchantId: string,
    @Body() data: UpdateMerchantProfileDto,
  ) {
    return this.merchantService.updateProfile(merchantId, data);
  }

  @Get(":merchantId/export")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  exportMerchantData() {
    return {
      message: "Export started",
    };
  }

  @Patch(":merchantId/settings")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  updateSettings() {
    return {
      message: "Settings updated",
    };
  }

  @Post(":merchantId/customers")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN, MerchantRole.OPERATOR)
  createCustomer() {
    return {
      message: "Customer created",
    };
  }

  @Patch(":merchantId/customers/:id")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN, MerchantRole.OPERATOR)
  updateCustomer() {
    return {
      message: "Customer updated",
    };
  }

  @Delete(":merchantId/customers/:id")
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  deleteCustomer() {
    return {
      message: "Customer deleted",
    };
  }

  @Get(":merchantId/customers")
  @Roles(
    MerchantRole.OWNER,
    MerchantRole.ADMIN,
    MerchantRole.OPERATOR,
    MerchantRole.VIEWER,
  )
  findAll() {
    return [];
  }
}
