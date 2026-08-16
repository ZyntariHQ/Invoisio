import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { TestingModule } from "@nestjs/testing";
import { MerchantRole } from "../../common/enums/merchant-role.enum";

export const TEST_JWT_SECRET = "test-secret-at-least-32-chars-0123456789";

class TestJwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: TEST_JWT_SECRET,
    });
  }

  validate(payload: any) {
    return {
      id: payload.sub,
      merchantId: payload.merchantId,
      role: payload.role,
      isAdmin: payload.isAdmin ?? false,
    };
  }
}

export const jwtAuthImports = [
  PassportModule.register({ defaultStrategy: "jwt" }),
  JwtModule.register({ secret: TEST_JWT_SECRET }),
];

export const jwtAuthProviders = [TestJwtStrategy];

export function signUserToken(
  module: TestingModule,
  user: {
    id: string;
    merchantId: string;
    role: MerchantRole;
    isAdmin?: boolean;
  },
): string {
  const jwtService = module.get<JwtService>(JwtService);
  return jwtService.sign({
    sub: user.id,
    merchantId: user.merchantId,
    role: user.role,
    isAdmin: user.isAdmin ?? false,
  });
}
