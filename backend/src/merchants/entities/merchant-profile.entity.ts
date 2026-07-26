export class MerchantProfile {
  id: string;
  name: string;
  stellarPublicKey: string;
  businessEmail: string | null;
  preferredAsset: string;
  payoutWallet: string | null;
  createdAt: Date;
  updatedAt: Date;
}
