-- Add nonce_used_at column for single-use nonce tracking
ALTER TABLE "users" ADD COLUMN "nonce_used_at" TIMESTAMP(3);
