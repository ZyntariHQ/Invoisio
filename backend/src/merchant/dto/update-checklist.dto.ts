import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";

export class UpdateChecklistDto {
  @IsOptional()
  @IsBoolean()
  profileCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  payoutKeyCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  assetPreferenceCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  firstInvoiceCompleted?: boolean;
}
