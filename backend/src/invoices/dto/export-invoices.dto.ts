import {
  IsOptional,
  IsEnum,
  IsString,
  IsDateString,
} from "class-validator";
import { Transform } from "class-transformer";
import { InvoiceStatus } from "@prisma/client";

export class ExportInvoicesDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  assetCode?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @IsOptional()
  limit?: number;
}