import {
  IsString,
  IsNumber,
  IsEmail,
  IsOptional,
  IsAlphanumeric,
  IsNotEmpty,
  ValidateIf,
  Matches,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";

/**
 * DTO for creating a new invoice
 */
export class CreateInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsString()
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  /** Asset code for payment (e.g. 'XLM', 'USDC', or any valid Stellar asset code) */
  @IsAlphanumeric()
  @IsNotEmpty()
  // normalize to uppercase early so controllers and services always see
  // a canonical code (helps with tests and reduces duplication)
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  asset_code: string;

  /**
   * Issuing account for the asset.
   * Required for all non-native assets (i.e. when asset_code !== 'XLM').
   * Must be a valid Stellar public key (G... 56 chars).
   */
  @ValidateIf((o: CreateInvoiceDto) => o.asset_code?.toUpperCase() !== "XLM")
  @IsNotEmpty({ message: "asset_issuer is required for non-XLM assets" })
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "asset_issuer must be a valid Stellar public key",
  })
  asset_issuer?: string;
}
