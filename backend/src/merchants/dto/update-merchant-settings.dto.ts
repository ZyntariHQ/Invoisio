import { IsString, IsOptional, Matches, IsIn } from "class-validator";

/**
 * DTO for updating merchant settings (profile, payout wallet, preferred asset).
 */
export class UpdateMerchantSettingsDto {
  /** Merchant display name */
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Payout Stellar public key (G... 56 chars).
   * Used as the destination for payout disbursements.
   */
  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message:
      "payoutPublicKey must be a valid Stellar public key starting with G and 56 characters long",
  })
  payoutPublicKey?: string;

  /** Preferred asset code for invoices (e.g. USDC, EURC, XLM) */
  @IsString()
  @IsOptional()
  @IsIn(["USDC", "EURC", "XLM", "USD"], {
    message: "preferredAsset must be one of: USDC, EURC, XLM, USD",
  })
  preferredAsset?: string;

  /** Webhook URL for event notifications */
  @IsString()
  @IsOptional()
  webhookUrl?: string;
}
