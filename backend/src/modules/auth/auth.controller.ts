import { Controller, Post, Get, Body, Headers, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('api/auth/wallet')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  @ApiOperation({ summary: 'Get a nonce challenge to sign with the wallet' })
  getChallenge(@Body('walletAddress') walletAddress: string) {
    return this.authService.getChallenge(walletAddress);
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect wallet and receive a JWT' })
  connectWallet(@Body() connectWalletDto: ConnectWalletDto, @Headers('x-request-id') requestId?: string) {
    return this.authService.connectWallet(connectWalletDto, requestId);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect wallet' })
  disconnectWallet() {
    return this.authService.disconnectWallet();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet connection status' })
  getWalletStatus(@GetUser() user: any) {
    return this.authService.getWalletStatus(user);
  }

  @Post('verify-signature')
  @ApiOperation({ summary: 'Verify Starknet signature for a message' })
  verifySignature(@Body() verifySignatureDto: VerifySignatureDto) {
    return this.authService.verifySignature(verifySignatureDto);
  }
}