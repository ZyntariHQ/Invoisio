export class User {
  id: string;

  merchantId: string;

  publicKey: string;

  email?: string;

  nonce?: string | null;

  nonceExpiresAt?: number | bigint | null;

  isAdmin: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}
