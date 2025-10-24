import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nonce?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;
}
