import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from "class-validator";

/**
 * DTO for updating an existing customer profile
 */
export class UpdateCustomerDto {
  @IsString()
  @IsNotEmpty({ message: "Customer name cannot be empty" })
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsEmail({}, { message: "Invalid email address" })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
