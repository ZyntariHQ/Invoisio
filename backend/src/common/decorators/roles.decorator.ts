import { SetMetadata } from "@nestjs/common";
import { MerchantRole } from "../enums/merchant-role.enum";

export const ROLES_KEY = "roles";

export const Roles = (...roles: MerchantRole[]) =>
  SetMetadata(ROLES_KEY, roles);
