import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "src/auth/guard/auth.guard";
import { MerchantMembershipGuard } from "src/common/gaurds/merchant-membership.guard";
import { MerchantRolesGuard } from "src/common/gaurds/merchant-roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { MerchantRole } from "src/common/enums/merchant-role.enum";

@UseGuards(JwtAuthGuard, MerchantMembershipGuard, MerchantRolesGuard)
@Controller("merchants")
export class MerchantController {
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
