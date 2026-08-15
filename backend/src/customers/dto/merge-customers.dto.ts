import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

/**
 * Request body for POST /customers/:winnerId/merge/:loserId
 *
 * The winner (primary) record is kept; the loser (duplicate) record has its
 * invoices re-pointed to the winner and is then deleted.
 */
export class MergeCustomersDto {
  /**
   * Optional free-text reason for the merge, surfaced in the audit log.
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  mergeNote?: string;
}
