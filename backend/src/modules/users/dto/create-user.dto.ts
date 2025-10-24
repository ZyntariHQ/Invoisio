import { IsString, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  walletAddress: string;

  @IsOptional()
  @IsString()
  nonce?: string;
}
