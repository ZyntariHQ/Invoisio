import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('api/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate a Starknet payment for an invoice' })
  initiate(@GetUser('sub') userId: string, @Body() initiatePaymentDto: InitiatePaymentDto) {
    return this.paymentsService.initiatePayment(userId, initiatePaymentDto);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get payment status by id' })
  getStatus(@GetUser('sub') userId: string, @Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(userId, id);
  }

  @Get('rates')
  @ApiOperation({ summary: 'Get latest token rates' })
  getRates() {
    return this.paymentsService.getRates();
  }
}