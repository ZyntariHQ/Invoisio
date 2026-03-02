import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { NonceRequestDto, VerifyRequestDto } from "./dtos/auth.dto";
import { Auth, CurrentUser } from "./guard/auth.guard";
import { User } from "../users/user.entity";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/nonce
   * Returns a unique nonce for the given Stellar public key.
   */
  @Post("nonce")
  @HttpCode(HttpStatus.OK)
  async nonce(@Body() dto: NonceRequestDto) {
    return this.authService.generateNonce(dto);
  }

  /**
   * POST /auth/verify
   * Verifies the signed nonce and issues a JWT.
   */
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyRequestDto) {
    return this.authService.verify(dto);
  }

  /**
   * GET /auth/me  — example protected route
   */
  @Auth()
  @Get("me")
  getProfile(@CurrentUser() user: User) {
    return {
      id: user.id,
      publicKey: user.publicKey,
      createdAt: user.createdAt,
    };
  }
}
