/*
  Warnings:

  - You are about to drop the column `payout_public_key` on the `merchants` table. All the data in the column will be lost.
  - You are about to drop the column `nonceExpiresAt` on the `users` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvoiceStatus" ADD VALUE 'draft';
ALTER TYPE "InvoiceStatus" ADD VALUE 'partially_paid';

-- DropForeignKey
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_user_id_fkey";

-- DropIndex
DROP INDEX "activity_events_created_at_idx";

-- DropIndex
DROP INDEX "invoices_client_email_trgm_idx";

-- DropIndex
DROP INDEX "invoices_client_name_trgm_idx";

-- DropIndex
DROP INDEX "invoices_memo_trgm_idx";

-- AlterTable
ALTER TABLE "activity_events" ALTER COLUMN "type" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "draft_data" JSONB,
ADD COLUMN     "draft_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "is_draft" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_auto_saved_at" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "payout_public_key",
ALTER COLUMN "preferred_asset" SET DEFAULT 'XLM';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "nonceExpiresAt",
ADD COLUMN     "nonce_expires_at" BIGINT,
ADD COLUMN     "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "push_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "payment_reviews" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "invoice_id" TEXT,
    "tx_hash" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "amount" DECIMAL(18,7) NOT NULL,
    "asset_code" TEXT,
    "asset_issuer" TEXT,
    "payer" TEXT,
    "original_memo" TEXT,
    "issue_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_reviews_tx_hash_key" ON "payment_reviews"("tx_hash");

-- CreateIndex
CREATE INDEX "payment_reviews_merchant_id_idx" ON "payment_reviews"("merchant_id");

-- CreateIndex
CREATE INDEX "payment_reviews_status_idx" ON "payment_reviews"("status");

-- CreateIndex
CREATE INDEX "activity_events_created_at_idx" ON "activity_events"("created_at");

-- CreateIndex
CREATE INDEX "invoices_is_draft_merchant_id_idx" ON "invoices"("is_draft", "merchant_id");

-- CreateIndex
CREATE INDEX "invoices_last_auto_saved_at_idx" ON "invoices"("last_auto_saved_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
