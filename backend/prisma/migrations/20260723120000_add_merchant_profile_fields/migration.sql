ALTER TABLE "merchants" ADD COLUMN "business_email" TEXT;
ALTER TABLE "merchants" ADD COLUMN "preferred_asset" TEXT NOT NULL DEFAULT 'XLM';
ALTER TABLE "merchants" ADD COLUMN "payout_wallet" TEXT;
