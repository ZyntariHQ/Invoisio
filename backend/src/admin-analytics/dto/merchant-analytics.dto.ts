import { IsDateString, IsOptional, IsString } from "class-validator";

export class MerchantAnalyticsQueryDto {
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
