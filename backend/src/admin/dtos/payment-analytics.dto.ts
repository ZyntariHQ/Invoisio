import {
  IsOptional,
  IsString,
  IsDateString,
  ValidateIf,
} from "class-validator";

/**
 * Query parameters for payment analytics endpoint
 */
export class PaymentAnalyticsQueryDto {
  @IsOptional()
  @IsString({
    message: "asset must be a string (e.g., XLM, USDC)",
  })
  asset?: string;

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
 * Response DTO for payment analytics
 */
export class PaymentAnalyticsResponseDto {
  totalVolume: number;
  totalCount: number;
  byAsset: {
    assetCode: string;
    assetIssuer?: string;
    volume: number;
    count: number;
  }[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}
