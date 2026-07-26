import { IsString, IsOptional, IsNumber, IsDateString } from "class-validator";

/**
 * Public invoice view for payers — excludes sensitive merchant data
 */
export class PublicInvoiceDto {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  merchantName: string;

  @IsString()
  description?: string;

  @IsNumber()
  amount: number;

  @IsString()
  asset_code: string;

  @IsString()
  @IsOptional()
  asset_issuer?: string;

  @IsString()
  memo: string;

  @IsString()
  destination_address: string;

  @IsString()
  status: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsDateString()
  createdAt: string;
}
