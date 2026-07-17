-- Add per-user token version to support JWT session revocation (logout).
ALTER TABLE "users"
ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

