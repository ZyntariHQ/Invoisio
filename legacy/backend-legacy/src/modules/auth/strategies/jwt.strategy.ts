import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string; 
  walletAddress: string;
  iat?: number;
  exp?: number;
}


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    } as any);
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findOrCreateByWalletAddress(payload.walletAddress);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return { userId: user.id, walletAddress: user.walletAddress };
  }
}