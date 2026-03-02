import { IsString, Length } from "class-validator";

export class NonceRequestDto {
  @IsString()
  @Length(56, 56, {
    message: "publicKey must be a valid 56-character Stellar public key",
  })
  publicKey: string;
}

export class VerifyRequestDto {
  @IsString()
  @Length(56, 56, {
    message: "publicKey must be a valid 56-character Stellar public key",
  })
  publicKey: string;

  @IsString()
  signedNonce: string;
}
