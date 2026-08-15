import {
  IsOptional,
  IsDateString,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsString,
} from "class-validator";
import { InvoiceEngagementEventType } from "@prisma/client";

export class MerchantEngagementQueryDto {
  @IsOptional()
  @IsUUID(4)
  invoiceId?: string;

  @IsOptional()
  @IsEnum(InvoiceEngagementEventType)
  eventType?: InvoiceEngagementEventType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsString()
  anonymizedVisitorId?: string;
}

export class MerchantEngagementSummaryQueryDto {
  @IsOptional()
  @IsUUID(4)
  invoiceId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
