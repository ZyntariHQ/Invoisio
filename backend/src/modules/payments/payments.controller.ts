import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // @Post('initiate')
  // initiate(@Req() req: any, @Body() initiatePaymentDto: InitiatePaymentDto) {
  //   const userId = req.user?.userId;
  //   return this.paymentsService.initiatePayment(userId, initiatePaymentDto);
  // }

  // @Get(':id/status')
  // getStatus(@Req() req: any, @Param('id') id: string) {
  //   const userId = req.user?.userId;
  //   return this.paymentsService.getPaymentStatus(userId, id);
  // }

  // @Get('rates')
  // getRates() {
  //   return this.paymentsService.getRates();
  // }

  // @Post(':id/confirm')
  // confirm(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
  //   const userId = req.user?.userId;
  //   return this.paymentsService.confirmPayment(userId, id, dto);
  // }

    /**
   * Initiate a new payment for a specific user
   * POST /payments/:userId/initiate
   */
    @Post('initiate/:userId')
    initiate(
      @Param('userId') userId: string,
      @Body() initiatePaymentDto: InitiatePaymentDto,
    ) {
      return this.paymentsService.initiatePayment(userId, initiatePaymentDto);
    }
  
    /**
     * Get payment status by user and payment id
     * GET /payments/:userId/:id/status
     */
    @Get('status/:userId/:id')
    getStatus(
      @Param('userId') userId: string,
      @Param('id') id: string,
    ) {
      return this.paymentsService.getPaymentStatus(userId, id);
    }
  
    /**
     * Get live token exchange rates
     * GET /payments/rates
     */
    @Get('rates')
    getRates() {
      return this.paymentsService.getRates();
    }
  
    /**
     * Confirm a payment (optionally verify on-chain)
     * POST /payments/:userId/:id/confirm
     */
    @Post('confirm/:userId/:id')
    confirm(
      @Param('userId') userId: string,
      @Param('id') id: string,
      @Body() dto: ConfirmPaymentDto,
    ) {
      return this.paymentsService.confirmPayment(userId, id, dto);
    }
  
  @Get('user/:id')
findAllByUser(@Param('id') userId: string) {
  return this.paymentsService.findAllByUser(userId);
}

@Get('invoice/:id')
findAllByInvoice(@Param('id') invoiceId: string) {
  return this.paymentsService.findAllByInvoice(invoiceId);
}

}