import {
  IsAlphanumeric,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

export class UpsertMerchantProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  businessEmail: string;

  @IsAlphanumeric()
  @IsNotEmpty()
  @MaxLength(12)
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  preferredAsset: string;

  @IsString()
  @Matches(STELLAR_PUBLIC_KEY_PATTERN, {
    message: "payoutWallet must be a valid Stellar public key",
  })
  payoutWallet: string;
}

export class UpdateMerchantProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  businessEmail?: string;

  @IsOptional()
  @IsAlphanumeric()
  @IsNotEmpty()
  @MaxLength(12)
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  preferredAsset?: string;

  @IsOptional()
  @IsString()
  @Matches(STELLAR_PUBLIC_KEY_PATTERN, {
    message: "payoutWallet must be a valid Stellar public key",
  })
  payoutWallet?: string;
}
