-- Non-blocking index creations. Execute each statement separately (psql will run them outside a transaction by default when passed with -v ON_ERROR_STOP=1).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_status_next_created ON webhook_deliveries (status, next_attempt_at, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_invoice_id ON webhook_deliveries (invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_user_id ON webhook_deliveries (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_merchant_status_created ON invoices (merchant_id, status, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_status_due_date ON invoices (status, due_date);

-- Consider running VACUUM ANALYZE on large tables after index creation to refresh planner statistics.
