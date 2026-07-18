-- CreateEnum
CREATE TYPE "WebhookAttemptStatus" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "webhook_attempts" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_url" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "response_status_code" INTEGER,
    "error_message" TEXT,
    "status" "WebhookAttemptStatus" NOT NULL,
    "signature_present" BOOLEAN NOT NULL DEFAULT false,
    "signature_algorithm" TEXT,
    "signature_preview" TEXT,
    "signature_length" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_attempts_invoice_id_created_at_idx" ON "webhook_attempts"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_attempts_user_id_created_at_idx" ON "webhook_attempts"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "webhook_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
