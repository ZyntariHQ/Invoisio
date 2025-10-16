import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator'

export class ConfirmPaymentDto {
  @IsString()
  transactionHash: string

  @IsOptional()
  @IsEnum(['pending', 'completed', 'failed'])
  status?: 'pending' | 'completed' | 'failed'

  @IsOptional()
  @IsBoolean()
  verify?: boolean
}