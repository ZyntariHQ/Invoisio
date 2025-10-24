import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceItemDto } from './invoice-item.dto';

export class CreateInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsString()
  clientName: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  merchantWalletAddress?: string;

  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}










// import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
// import { Type } from 'class-transformer';

// class InvoiceItemDto {
//   @IsString()
//   description: string;

//   @IsNumber()
//   @Min(0)
//   quantity: number;

//   @IsNumber()
//   @Min(0)
//   unitPrice: number;

//   @IsOptional()
//   @IsNumber()
//   @Min(0)
//   taxRate?: number;
// }

// export class CreateInvoiceDto {
//   @IsString()
//   clientName: string;

//   @IsOptional()
//   @IsString()
//   clientEmail?: string;

//   @IsOptional()
//   @IsString()
//   currency?: string;

//   @IsArray()
//   @ValidateNested({ each: true })
//   @Type(() => InvoiceItemDto)
//   items: InvoiceItemDto[];
// }