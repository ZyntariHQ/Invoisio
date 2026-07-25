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

    const payloadVersion = payload.tokenVersion ?? 0;
    const userVersion = user.tokenVersion ?? 0;
    if (payloadVersion !== userVersion) {
      throw new UnauthorizedException("Token has been revoked.");
    }

    return {
      id: user.id,
      merchantId: user.merchantId,
      publicKey: user.publicKey,
      nonce: user.nonce ?? null,
      nonceExpiresAt: user.nonceExpiresAt ?? null,
      nonceUsedAt: user.nonceUsedAt ?? null,
      tokenVersion: user.tokenVersion ?? 0,
      isAdmin: user.isAdmin ?? false,
      webhookUrl: user.webhookUrl ?? null,
      webhookSecret: user.webhookSecret ?? null,
      pushTokens: user.pushTokens ?? [],
      pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
      email: user.email ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
