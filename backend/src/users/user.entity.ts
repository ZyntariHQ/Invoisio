import { MerchantRole } from "../common/enums/merchant-role.enum";

export class User {
  id: string;

  merchantId: string;

  role: MerchantRole;

  publicKey: string;

  email?: string;

  nonce?: string | null;

  nonceExpiresAt?: number | bigint | null;

  /**
   * JWT session version used for revocation.
   * Incrementing this value invalidates previously issued tokens.
   */
  tokenVersion: number;

  isAdmin: boolean;

  pushNotificationsEnabled: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}
