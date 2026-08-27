import {
  IsAlphanumeric,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { RecurringFrequency } from "@prisma/client";

/**
 * DTO for defining a new recurring billing rule.
 * merchantId and createdByUserId come from the authenticated request,
 * never from the request body.
 */
export class CreateScheduleDto {
  @IsUUID()
  customerId: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsAlphanumeric()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  assetCode: string;

  @ValidateIf((o: CreateScheduleDto) => o.assetCode?.toUpperCase() !== "XLM")
  @IsNotEmpty({ message: "assetIssuer is required for non-XLM assets" })
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "assetIssuer must be a valid Stellar public key",
  })
  assetIssuer?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;
}
