import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";

export enum InvoiceStatus {
  pending = "pending",
  paid = "paid",
  overdue = "overdue",
  cancelled = "cancelled",
}

/**
 * Query parameters for invoice analytics endpoint
 */
export class InvoiceAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus, {
    message: "status must be one of: pending, paid, overdue, cancelled",
  })
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "startDate must be a valid ISO 8601 date string",
    },
  )
  @ValidateIf((o) => o.endDate !== undefined)
  startDate?: string;

  @IsOptional()
  @IsDateString(
    {},
    {
      message: "endDate must be a valid ISO 8601 date string",
    },
  )
  @ValidateIf((o) => o.startDate !== undefined)
  endDate?: string;

  // Custom validation for date range
  validateDates(): void {
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      if (start > end) {
        throw new Error("startDate must be before or equal to endDate");
      }
      // Limit range to 1 year to prevent overly broad queries
      const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
      if (end.getTime() - start.getTime() > oneYearInMs) {
        throw new Error("Date range cannot exceed 1 year");
      }
    }
  }
}

/**
 * Response DTO for invoice analytics
 */
export class InvoiceAnalyticsResponseDto {
  totalCount: number;
  totalAmount: number;
  byStatus: {
    status: string;
    count: number;
    amount: number;
  }[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}
