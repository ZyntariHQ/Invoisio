export class User {
  id: string;

  merchantId: string;

  publicKey: string;

  email?: string;

  nonce?: string | null;

  nonceExpiresAt?: number | bigint | null;

  nonceUsedAt?: Date | null;

  /**
   * JWT session version used for revocation.
   * Incrementing this value invalidates previously issued tokens.
   */
  tokenVersion: number;

  isAdmin: boolean;

  webhookUrl?: string | null;

  webhookSecret?: string | null;

  pushTokens: string[];

  pushNotificationsEnabled: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}
