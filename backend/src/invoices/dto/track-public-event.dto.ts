import { IsString, IsNotEmpty, IsOptional, IsObject, IsIn } from "class-validator";

export const PUBLIC_INVOICE_ACTIONS = [
  "view",
  "wallet_launch",
  "copy_address",
  "copy_memo",
  "copy_amount",
  "qr_expand",
  "download_pdf",
] as const;

export type PublicInvoiceAction = (typeof PUBLIC_INVOICE_ACTIONS)[number];

export class TrackPublicEventDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(PUBLIC_INVOICE_ACTIONS)
  action: PublicInvoiceAction;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ConversionMetricsDto {
  views: number;
  walletLaunches: number;
  copies: number;
  totalActions: number;
  lastActionAt: Date | null;
}
