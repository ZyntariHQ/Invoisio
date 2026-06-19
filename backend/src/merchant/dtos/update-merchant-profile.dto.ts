import { IsEmail, IsOptional, IsString } from 'class-validator';
import { IsStellarPublicKey } from '../../common/validators/is-stellar-public-key.validator';

export class UpdateMerchantProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  businessEmail?: string;

  @IsString()
  @IsOptional()
  preferredAsset?: string;

  @IsStellarPublicKey()
  @IsOptional()
  payoutWallet?: string;
}
