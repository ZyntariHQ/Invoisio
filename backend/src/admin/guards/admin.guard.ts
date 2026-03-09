import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { User } from "../../users/user.entity";

export const IS_ADMIN_KEY = "isAdmin";

/**
 * Admin role guard - extends JWT authentication guard.
 * Must be used after @Auth() decorator.
 * Checks if the authenticated user has admin role.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException("Authentication required.");
    }

    // Check if user has admin role
    // The role is loaded from the database in the JWT strategy
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required.");
    }

    return true;
  }
}
