import {
  IsString,
  IsNumber,
  IsEmail,
  IsOptional,
  IsAlphanumeric,
  IsNotEmpty,
  IsUUID,
  ValidateIf,
  Matches,
  Min,
  IsBoolean,
  IsDateString,
} from "class-validator";
import { Transform } from "class-transformer";

/**
 * DTO for saving a draft invoice
 * All fields are optional to support partial draft saves
 */
export class DraftInvoiceDto {
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsEmail()
  @IsOptional()
  clientEmail?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0.0000001)
  @IsOptional()
  amount?: number;

  /** Asset code for payment (e.g. 'XLM', 'USDC', or any valid Stellar asset code) */
  @IsAlphanumeric()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  asset_code?: string;

  /**
   * Issuing account for the asset.
   * Required for all non-native assets (i.e. when asset_code !== 'XLM').
   * Must be a valid Stellar public key (G... 56 chars).
   */
  @ValidateIf(
    (o: DraftInvoiceDto) =>
      o.asset_code?.toUpperCase() !== "XLM" && o.asset_code !== undefined,
  )
  @IsNotEmpty({ message: "asset_issuer is required for non-XLM assets" })
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "asset_issuer must be a valid Stellar public key",
  })
  @IsOptional()
  asset_issuer?: string;

  /** Optional customer ID to link this invoice to a saved client profile */
  @IsUUID()
  @IsOptional()
  customer_id?: string;

  /** Due date for the invoice */
  @IsDateString()
  @IsOptional()
  due_date?: string;

  /** Additional metadata for the draft */
  @IsOptional()
  metadata?: Record<string, unknown>;
}

/**
 * DTO for creating a new draft from scratch
 */
export class CreateDraftDto extends DraftInvoiceDto {
  // All fields already optional from parent
}

/**
 * DTO for updating an existing draft
 */
export class UpdateDraftDto extends DraftInvoiceDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsBoolean()
  @IsOptional()
  autoSave?: boolean;
}

/**
 * Response DTO for draft operations
 */
export class DraftResponseDto {
  id: string;
  merchantId: string;
  userId?: string;
  invoiceNumber?: string;
  clientName?: string;
  clientEmail?: string;
  description?: string;
  amount?: string | number;
  assetCode?: string;
  assetIssuer?: string;
  customerId?: string;
  dueDate?: Date;
  isDraft: boolean;
  draftVersion: number;
  lastAutoSavedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;

  // Computed fields for UI
  hasRequiredFields?: boolean;
  completionPercentage?: number;
}
