import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from "class-validator";

/**
 * DTO for creating a new customer profile
 */
export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty({ message: "Customer name is required" })
  @MaxLength(200)
  name: string;

  @IsEmail({}, { message: "Invalid email address" })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
