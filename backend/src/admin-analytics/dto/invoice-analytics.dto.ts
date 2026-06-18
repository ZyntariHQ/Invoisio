import { IsDateString, IsOptional, IsEnum } from "class-validator";
import { InvoiceStatus } from "@prisma/client";

export class InvoiceAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
