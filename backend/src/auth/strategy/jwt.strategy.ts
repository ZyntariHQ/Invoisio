import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { User } from "../../users/user.entity";

export interface JwtPayload {
  sub: string;
  publicKey: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "",
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }
    return {
      id: user.id,
      publicKey: user.publicKey,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      email: user.email,
    } as any;
  }
}
