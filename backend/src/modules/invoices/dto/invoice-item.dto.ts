import { IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  id: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  rate: number;

  @IsNumber()
  amount: number;
}
