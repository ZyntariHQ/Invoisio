-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "payout_public_key" TEXT;
ALTER TABLE "merchants" ADD COLUMN "preferred_asset" TEXT NOT NULL DEFAULT 'USDC';
