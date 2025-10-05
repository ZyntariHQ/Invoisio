import { Controller, Post, Get, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/auth/wallet')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('connect')
  connectWallet(@Body() connectWalletDto: ConnectWalletDto) {
    return this.authService.connectWallet(connectWalletDto);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnectWallet() {
    return this.authService.disconnectWallet();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getWalletStatus() {
    return this.authService.getWalletStatus();
  }

  @Post('verify-signature')
  verifySignature(@Body() verifySignatureDto: VerifySignatureDto) {
    return this.authService.verifySignature(verifySignatureDto);
  }
}