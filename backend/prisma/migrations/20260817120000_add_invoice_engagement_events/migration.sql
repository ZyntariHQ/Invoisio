-- CreateEnum
CREATE TYPE "InvoiceEngagementEventType" AS ENUM ('view', 'wallet_launch', 'copy', 'other');

-- CreateTable
CREATE TABLE "invoice_engagement_events" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "type" "InvoiceEngagementEventType" NOT NULL,
    "target" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_engagement_events_invoice_id_created_at_idx" ON "invoice_engagement_events"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_engagement_events_merchant_id_type_created_at_idx" ON "invoice_engagement_events"("merchant_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "invoice_engagement_events" ADD CONSTRAINT "invoice_engagement_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_engagement_events" ADD CONSTRAINT "invoice_engagement_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
