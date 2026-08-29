import { registerAs } from "@nestjs/config";

/**
 * Draft configuration
 *
 * Controls the stale-draft cleanup job behaviour.
 * All values are read from environment variables at startup, so a process
 * restart is sufficient to apply changes — no code change required.
 *
 * Environment variables
 * ---------------------
 * DRAFT_RETENTION_DAYS  (number, default 30)
 *   Number of days a draft can go without being auto-saved before it becomes
 *   eligible for deletion by the cleanup job.  The cutoff is measured against
 *   `lastAutoSavedAt` (set to `createdAt` on first save).
 *
 * DRAFT_CLEANUP_CRON  (cron expression, default "0 3 * * *")
 *   When the cleanup job fires.  The expression is in standard 5-field cron
 *   syntax and is interpreted in the server's local timezone (UTC in
 *   production).  The default runs once a day at 03:00 UTC, offset from the
 *   overdue-invoice job (02:00 UTC) to avoid DB lock contention.
 *
 *   Examples:
 *     "0 3 * * *"   – daily at 03:00 UTC  (production default)
 *     "* * * * *"   – every minute        (useful for local smoke-testing)
 *     "0 3 * * 0"   – weekly, Sundays at 03:00 UTC
 */
export default registerAs("draft", () => ({
  retentionDays: parseInt(process.env.DRAFT_RETENTION_DAYS ?? "30", 10),
  cleanupCron: process.env.DRAFT_CLEANUP_CRON ?? "0 3 * * *",
}));
