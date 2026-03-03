export class User {
  id: string;

  publicKey: string;

  email?: string;

  nonce?: string | null;

  nonceExpiresAt?: number | bigint | null;

  createdAt?: Date;

  updatedAt?: Date;
}
