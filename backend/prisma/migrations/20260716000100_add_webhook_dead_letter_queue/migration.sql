-- CreateEnum
CREATE TYPE "DeadLetterStatus" AS ENUM ('pending_retry', 'requeued', 'recovered');

-- AlterTable
ALTER TABLE "webhook_deliveries"
ADD COLUMN "dead_letter_id" TEXT;

-- CreateTable
CREATE TABLE "webhook_dead_letters" (
    "id" TEXT NOT NULL,
    "original_delivery_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "last_error" TEXT,
    "last_http_status" INTEGER,
    "failed_attempts" INTEGER NOT NULL,
    "exhausted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manual_retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retried_at" TIMESTAMP(3),
    "recovered_at" TIMESTAMP(3),
    "status" "DeadLetterStatus" NOT NULL DEFAULT 'pending_retry',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_dead_letters_original_delivery_id_key" ON "webhook_dead_letters"("original_delivery_id");

-- CreateIndex
CREATE INDEX "webhook_dead_letters_merchant_id_idx" ON "webhook_dead_letters"("merchant_id");

-- CreateIndex
CREATE INDEX "webhook_dead_letters_status_exhausted_at_idx" ON "webhook_dead_letters"("status", "exhausted_at");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_dead_letter_id_fkey" FOREIGN KEY ("dead_letter_id") REFERENCES "webhook_dead_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_dead_letters" ADD CONSTRAINT "webhook_dead_letters_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_dead_letters" ADD CONSTRAINT "webhook_dead_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
