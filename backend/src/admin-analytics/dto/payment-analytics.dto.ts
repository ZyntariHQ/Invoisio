import { IsDateString, IsOptional, IsString } from "class-validator";

export class PaymentAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  asset?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
