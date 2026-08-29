Webhook delivery retention
-------------------------

To prevent the `webhook_deliveries` table from growing without bound, we retain successful deliveries for `WEBHOOK_RETENTION_DAYS` (default 90) and delete older rows daily.

Implementation notes:
- A daily cron job (`WebhooksService.cleanupDelivered`) deletes successful deliveries in batches to avoid long-running transactions.
- Indexes on `status, next_attempt_at, created_at` support the queue poll efficiently.
- Use `WEBHOOK_RETENTION_DAYS=0` to disable automated retention (not recommended).

To run the non-blocking index migrations, use:

```bash
DATABASE_URL=postgres://user:pass@host/db backend/scripts/run_non_blocking_migrations.sh
```
