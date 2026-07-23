ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "business_email" TEXT;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "preferred_asset" TEXT NOT NULL DEFAULT 'XLM';
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "payout_wallet" TEXT;
