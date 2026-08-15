import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  IsUUID,
  IsNotEmpty,
  Matches,
  IsObject,
  Max,
  Min,
  MaxLength,
} from "class-validator";
import { InvoiceEngagementEventType } from "@prisma/client";

export class CaptureEngagementEventDto {
  @IsUUID(4)
  @IsNotEmpty()
  invoiceId: string;

  @IsEnum(InvoiceEngagementEventType)
  @IsNotEmpty()
  eventType: InvoiceEngagementEventType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: "anonymizedVisitorId must be alphanumeric with - or _ only",
  })
  anonymizedVisitorId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  viewportWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  viewportHeight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsOptional()
  @IsDateString()
  clientCreatedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  deviceCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  funnelStep?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
