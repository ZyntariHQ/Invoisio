-- Add missing database indexes for the webhook queue, overdue sweep, and
-- merchant invoice list queries.

-- Webhook queue: the worker polls pending deliveries whose next attempt is due.
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- Overdue sweep: the daily cron marks pending invoices past their due date as overdue.
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- Merchant invoice list: the dashboard lists a merchant's non-draft invoices by
-- status, ordered by creation date.
CREATE INDEX "invoices_merchant_id_is_draft_status_created_at_idx" ON "invoices"("merchant_id", "is_draft", "status", "created_at");
