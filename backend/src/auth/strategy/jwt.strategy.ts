import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { User } from "../../users/user.entity";

export interface JwtPayload {
  sub: string;
  publicKey: string;
  merchantId?: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }

    // Session revocation:
    // - tokens include `tokenVersion` in their payload
    // - logout increments user's `tokenVersion`
    // - any token with a stale version is rejected
    const payloadVersion = payload.tokenVersion ?? 0;
    const userVersion = (user as any).tokenVersion ?? 0;
    if (payloadVersion !== userVersion) {
      throw new UnauthorizedException("Token has been revoked.");
    }

    return {
      id: user.id,
      merchantId: user.merchantId,
      publicKey: user.publicKey,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      email: user.email,
      isAdmin: user.isAdmin,
      tokenVersion: (user as any).tokenVersion ?? 0,
    } as any;
  }
}
