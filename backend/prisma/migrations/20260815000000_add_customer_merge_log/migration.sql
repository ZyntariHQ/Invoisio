-- CreateTable
CREATE TABLE "customer_merge_logs" (
    "id"               TEXT NOT NULL,
    "merchant_id"      TEXT NOT NULL,
    "winner_id"        TEXT NOT NULL,
    "loser_id"         TEXT NOT NULL,
    "loser_snapshot"   JSONB NOT NULL,
    "invoices_relinked" INTEGER NOT NULL DEFAULT 0,
    "merged_by"        TEXT,
    "merge_note"       TEXT,
    "merged_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_merge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_merge_logs_merchant_id_idx" ON "customer_merge_logs"("merchant_id");

-- CreateIndex
CREATE INDEX "customer_merge_logs_winner_id_idx" ON "customer_merge_logs"("winner_id");

-- CreateIndex
CREATE INDEX "customer_merge_logs_loser_id_idx" ON "customer_merge_logs"("loser_id");

-- AddForeignKey
ALTER TABLE "customer_merge_logs" ADD CONSTRAINT "customer_merge_logs_winner_id_fkey"
    FOREIGN KEY ("winner_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- loser row will be deleted after merge; use SetNull so the log survives.
ALTER TABLE "customer_merge_logs" ADD CONSTRAINT "customer_merge_logs_loser_id_fkey"
    FOREIGN KEY ("loser_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
