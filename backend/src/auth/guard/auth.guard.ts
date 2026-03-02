import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  applyDecorators,
  UseGuards,
  createParamDecorator,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";
import { User } from "../../users/user.entity";

export const IS_PUBLIC_KEY = "isPublic";

/** Mark a route as publicly accessible (no JWT required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * JWT authentication guard.
 * Apply globally or per-controller; use @Public() to opt out.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/**
 * Convenience decorator that applies JWT guard to a route.
 *
 * Usage:
 *   @Auth()
 *   @Get('profile')
 *   getProfile(@Req() req) { ... }
 */
export const Auth = () => applyDecorators(UseGuards(JwtAuthGuard));

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
