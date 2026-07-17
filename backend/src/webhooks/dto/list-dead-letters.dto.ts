import { DeadLetterStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListDeadLettersDto {
  @IsOptional()
  @IsEnum(DeadLetterStatus)
  status?: DeadLetterStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
