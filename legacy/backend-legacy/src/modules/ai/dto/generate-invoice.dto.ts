import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class GenerateInvoiceDto {
  @IsString()
  projectDescription: string;

  @IsOptional()
  @IsString()
  clientInfo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}