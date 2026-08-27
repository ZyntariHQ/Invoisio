import { IsEnum, IsIn, IsOptional } from "class-validator";
import { InvoiceEngagementEventType } from "@prisma/client";

/**
 * Field a payer copied or the wallet-launch link they used. Kept to a fixed
 * allow-list of field names so the public endpoint can never be used to
 * smuggle the copied value (e.g. a wallet address) into storage.
 */
export const ALLOWED_ENGAGEMENT_TARGETS = [
  "destination_address",
  "memo",
  "amount",
  "payment_uri",
] as const;

export type InvoiceEngagementTarget =
  (typeof ALLOWED_ENGAGEMENT_TARGETS)[number];

export class CreateInvoiceEngagementEventDto {
  @IsEnum(InvoiceEngagementEventType)
  type: InvoiceEngagementEventType;

  @IsOptional()
  @IsIn(ALLOWED_ENGAGEMENT_TARGETS)
  target?: InvoiceEngagementTarget;
}
