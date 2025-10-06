import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateInvoiceDto extends PartialType(
  OmitType(CreateInvoiceDto, ['items'] as const),
) {
  @IsOptional()
  @IsEnum(['draft', 'sent', 'paid', 'cancelled'])
  status?: 'draft' | 'sent' | 'paid' | 'cancelled';
}