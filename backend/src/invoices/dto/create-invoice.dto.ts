import { IsString, IsNumber, IsEmail, IsOptional, IsIn, Min } from 'class-validator';

/**
 * DTO for creating a new invoice
 */
export class CreateInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsString()
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsString()
  @IsIn(['XLM', 'USDC'])
  asset: 'XLM' | 'USDC';

  @IsString()
  @IsOptional()
  destination?: string;
}
