import { IsString, IsNotEmpty } from 'class-validator';

export class VerifySignatureDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}