import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

/**
 * Query DTO for invoice search endpoint
 */
export class SearchInvoicesDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
