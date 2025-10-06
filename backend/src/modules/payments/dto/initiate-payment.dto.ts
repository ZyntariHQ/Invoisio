import { IsString, IsEnum, IsNotEmpty } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsEnum(['ETH', 'STRK', 'USDC', 'USDT'])
  token: 'ETH' | 'STRK' | 'USDC' | 'USDT';

  @IsString()
  @IsNotEmpty()
  amount: string;
}