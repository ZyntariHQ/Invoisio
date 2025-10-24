import { Controller, Post, Get, Body, Headers, UseGuards, Res, Req } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { RequestNonceDto } from './dto/request-nonce.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../types/request-with-user';

@Controller('api/auth/wallet')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf-token')
  getCsrfToken(@Req() req: RequestWithUser, @Res() res: Response) {
    const token = req.csrfToken();
    res.json({ csrfToken: token });
  }

  @UseGuards(JwtAuthGuard)
@Get('me')
async getProfile(@Req() req: RequestWithUser) {
  const user = req.user; 
  return { user: user };
}

  @Post('connect')
  connectWallet(@Body() connectWalletDto: ConnectWalletDto) {
    return this.authService.connectWallet(connectWalletDto);
  }


   @Post('login')
   async login(
     @Body() data: { walletAddress: string },
     @Res({ passthrough: true }) res: Response,
   ) {
     const { walletAddress } = data;
 
     const { accessToken, refreshToken, user } =
       await this.authService.loginByWallet(walletAddress);
 
     res.cookie('access_token', accessToken, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 15 * 60 * 1000, // 15 min
     });
 
     res.cookie('refresh_token', refreshToken, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'lax',
       maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
     });
 
     return { message: 'Wallet connected successfully', user };
   }

   
  @Post('refresh')
  async refresh(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return { message: 'No refresh token provided' };
    }

    const { accessToken } = await this.authService.refresh(refreshToken);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    return { message: 'Access token refreshed' };
  }


  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Wallet disconnected successfully' };
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  disconnectWallet() {
    return this.authService.disconnectWallet();
  }



 
    @Get('status')
    @UseGuards(JwtAuthGuard)
    getWalletStatus(@Req() req: RequestWithUser) {
      return this.authService.getWalletStatus(req.user);
    }

  @Post('verify-signature')
  verifySignature(@Body() verifySignatureDto: VerifySignatureDto) {
    return this.authService.verifySignature(verifySignatureDto);
  }

  @Post('nonce')
  requestNonce(@Body() dto: RequestNonceDto) {
    return this.authService.requestNonce(dto.walletAddress);
  }
}