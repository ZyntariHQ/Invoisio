This migration creates non-blocking (CONCURRENTLY) indexes required for hot queries.

Run the SQL in this folder directly against your Postgres database using `psql` or the script provided in `backend/scripts/run_non_blocking_migrations.sh`.

Notes:
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Use the provided script which runs each statement separately.
- Running concurrently still consumes IO and CPU; prefer running during maintenance windows for very large tables.

Indexes added:
- webhook_deliveries: (status, next_attempt_at, created_at), (invoice_id), (user_id)
- invoices: (merchant_id, status, created_at), (status, due_date)
