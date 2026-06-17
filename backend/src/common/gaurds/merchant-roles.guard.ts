import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class MerchantRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const membership = request.membership;

    if (!membership) {
      throw new ForbiddenException("Merchant access required");
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
