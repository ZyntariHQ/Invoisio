import { IsString, IsNotEmpty } from 'class-validator';

export class RequestNonceDto {
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}