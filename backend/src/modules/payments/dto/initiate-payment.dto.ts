import { IsString, IsNotEmpty, IsIn, IsOptional, Matches } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsIn(['ETH', 'USDC', 'USDT'])
  token: 'ETH' | 'USDC' | 'USDT';

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsOptional()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  merchantAddress?: string;
}