import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  initiate(@Req() req: any, @Body() initiatePaymentDto: InitiatePaymentDto) {
    const userId = req.user?.userId;
    return this.paymentsService.initiatePayment(userId, initiatePaymentDto);
  }

  @Get(':id/status')
  getStatus(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.paymentsService.getPaymentStatus(userId, id);
  }

  @Get('rates')
  getRates() {
    return this.paymentsService.getRates();
  }

  @Post(':id/confirm')
  confirm(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    const userId = req.user?.userId;
    return this.paymentsService.confirmPayment(userId, id, dto);
  }
}