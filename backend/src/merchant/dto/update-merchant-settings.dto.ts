import { IsString, IsOptional, Matches, IsIn } from "class-validator";
import { IsSafeWebhookUrl } from "../../common/validators/is-safe-webhook-url.validator";

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

  /**
   * Webhook URL for event notifications.
   *
   * SECURITY: `@IsSafeWebhookUrl` enforces shape synchronously (absolute
   * URL, https-only unless localhost + local-dev flag, no embedded
   * credentials). It does NOT resolve DNS/IP ranges - that async check
   * happens in `MerchantsService.updateSettings` via
   * `SsrfProtectionService.assertSafeForWrite` before persisting, and is
   * re-checked independently at delivery time in `WebhooksService` /
   * `SafeWebhookHttpService` to guard against DNS rebinding between save
   * and send. Do not replace this with a bare `@IsString()` / `@IsUrl()`.
   */
  @IsString()
  @IsOptional()
  @IsSafeWebhookUrl()
  webhookUrl?: string;
}
