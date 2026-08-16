import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ROLES_KEY } from "../decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guard/auth.guard";

/**
 * Merchant-scoped role guard.
 *
 * Authenticates the request (JWT) and then enforces that the authenticated
 * user's merchant role is among the roles declared via @Roles() on the route.
 * The role is read from the freshly loaded user record (`request.user.role`),
 * falling back to `request.membership.role` for backwards compatibility.
 */
@Injectable()
export class MerchantRolesGuard extends JwtAuthGuard implements CanActivate {
  constructor(reflector: Reflector) {
    super(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const requiredRoles = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.user?.role ?? request.membership?.role;

    if (!role) {
      throw new ForbiddenException("Merchant access required");
    }

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
