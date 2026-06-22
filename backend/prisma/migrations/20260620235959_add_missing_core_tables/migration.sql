-- These tables exist in schema.prisma (InvoiceStatusHistory, Payment,
-- BackfillRun, ProcessedEvent) but were never created by a migration,
-- which left every environment that runs `prisma migrate deploy` from
-- scratch without these tables. Add them now, in dependency order, so
-- later migrations (e.g. payments_tx_hash_key) have something to act on.
--
-- invoices.amount_paid / invoices.amount_due are likewise declared in
-- schema.prisma and used throughout the partial-payment/reconciliation
-- code paths, but were never added by any migration either.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "amount_paid" DECIMAL(18,7) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "amount_due" DECIMAL(18,7);
UPDATE "invoices" SET "amount_due" = "amount" - "amount_paid" WHERE "amount_due" IS NULL;
ALTER TABLE "invoices" ALTER COLUMN "amount_due" SET NOT NULL;

-- CreateTable
CREATE TABLE "invoice_status_history" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_status_history_invoice_id_idx" ON "invoice_status_history"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_status_history" ADD CONSTRAINT "invoice_status_history_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(18,7) NOT NULL,
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "backfill_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "start_ledger" BIGINT,
    "end_ledger" BIGINT,
    "events_processed" INTEGER NOT NULL DEFAULT 0,
    "events_matched" INTEGER NOT NULL DEFAULT 0,
    "events_skipped" INTEGER NOT NULL DEFAULT 0,
    "events_failed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backfill_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" SERIAL NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "ledger" BIGINT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_tx_hash_invoice_id_contract_id_key" ON "processed_events"("tx_hash", "invoice_id", "contract_id");

-- CreateIndex
CREATE INDEX "processed_events_ledger_idx" ON "processed_events"("ledger");

-- CreateIndex
CREATE INDEX "processed_events_invoice_id_idx" ON "processed_events"("invoice_id");

-- CreateIndex
CREATE INDEX "processed_events_status_idx" ON "processed_events"("status");
