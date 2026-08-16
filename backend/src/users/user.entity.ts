export class User {
  id: string;

  merchantId: string;

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
