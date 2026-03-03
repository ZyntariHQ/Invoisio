import { StrKey, Keypair } from "@stellar/stellar-sdk";

export class StellarValidator {
  static isValidPublicKey(publicKey: string): boolean {
    try {
      return StrKey.isValidEd25519PublicKey(publicKey);
    } catch (error) {
      return false;
    }
  }

  static isValidSecretKey(secretKey: string): boolean {
    try {
      return StrKey.isValidEd25519SecretSeed(secretKey);
    } catch (error) {
      return false;
    }
  }

  static isValidContractAddress(contractAddress: string): boolean {
    try {
      return StrKey.isValidContract(contractAddress);
    } catch (error) {
      return false;
    }
  }

  static isValidIssuer(issuer: string): boolean {
    return this.isValidPublicKey(issuer);
  }

  static getPublicKeyFromSecret(secretKey: string): string {
    const keypair = Keypair.fromSecret(secretKey);
    return keypair.publicKey();
  }

  static generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  static isValidMemo(memo: string): boolean {
    if (!memo || typeof memo !== "string") {
      return false;
    }
    // Memos can be up to 28 bytes for text memos
    return Buffer.byteLength(memo, "utf8") <= 28;
  }

  static isValidAssetCode(assetCode: string): boolean {
    if (!assetCode || typeof assetCode !== "string") {
      return false;
    }
    // Asset codes are 1-12 alphanumeric characters
    return /^[a-zA-Z0-9]{1,12}$/.test(assetCode);
  }
}
