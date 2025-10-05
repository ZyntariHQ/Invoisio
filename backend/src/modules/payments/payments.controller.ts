import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  initiate(@Body() initiatePaymentDto: InitiatePaymentDto) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.paymentsService.initiatePayment(userId, initiatePaymentDto);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    // In a real implementation, you would get the userId from the JWT token
    const userId = 'user-id-from-jwt';
    return this.paymentsService.getPaymentStatus(userId, id);
  }

  @Get('rates')
  getRates() {
    return this.paymentsService.getRates();
  }
}