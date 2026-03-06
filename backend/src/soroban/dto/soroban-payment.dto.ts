import { IsNotEmpty, IsString, Matches } from "class-validator";

export class RecordPaymentDto {
  /** Unique invoice identifier, e.g. "invoisio-abc123" */
  @IsString()
  @IsNotEmpty()
  invoiceId!: string;

  /** Stellar G... address of the payer */
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "payer must be a valid Stellar public key",
  })
  payer!: string;

  /** "XLM" or a token code such as "USDC" */
  @IsString()
  @IsNotEmpty()
  assetCode!: string;

  /**
   * Issuer G... address for token assets; empty string ("") for XLM.
   * Validated by the contract — pass "" for native XLM.
   */
  @IsString()
  assetIssuer!: string;

  /**
   * Amount in smallest denomination as a string to preserve i128 precision.
   * - XLM: stroops (1 XLM = 10_000_000)
   * - Token: 7-decimal units (1 USDC = 10_000_000)
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: "amount must be a non-negative integer string" })
  amount!: string;
}
