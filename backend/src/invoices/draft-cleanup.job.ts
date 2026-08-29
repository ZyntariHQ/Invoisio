import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { DraftService } from "./draft.service";

/**
 * DraftCleanupJob
 *
 * Scheduled job that purges stale drafts by delegating to
 * {@link DraftService.cleanupOldDrafts}.  The cleanup is considered "stale"
 * when a draft has not been auto-saved for more than DRAFT_RETENTION_DAYS
 * days (default: 30).
 *
 * Schedule
 * ────────
 * The cron expression is controlled by the DRAFT_CLEANUP_CRON environment
 * variable (default: "0 3 * * *" — 03:00 UTC daily).  A restart is required
 * to pick up a new schedule.
 *
 * Observability
 * ─────────────
 * Three log events are emitted so ops can verify the job without a code change:
 *
 *   draft_cleanup_job_started   – emitted at the top of every run
 *   drafts_cleaned_up           – emitted (by DraftService) when count > 0
 *   draft_cleanup_job_complete  – emitted at the end of every successful run
 *   draft_cleanup_job_error     – emitted when an unexpected error is caught
 *
 * Errors are logged but not re-thrown so that a single bad run does not
 * prevent the scheduler from firing again on the next interval.
 */
@Injectable()
export class DraftCleanupJob {
  private readonly logger = new Logger(DraftCleanupJob.name);

  constructor(
    private readonly draftService: DraftService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Entry point invoked by the NestJS scheduler.
   *
   * The `@Cron` expression is evaluated at module initialisation time.
   * Changing DRAFT_CLEANUP_CRON therefore requires a process restart.
   */
  @Cron(
    // ConfigService is not yet available as a static value when the decorator
    // is evaluated, so we read the env var directly here.  The same pattern
    // is safe because ConfigModule.forRoot() processes dotenv before any
    // provider is instantiated, meaning process.env is already populated.
    process.env.DRAFT_CLEANUP_CRON ?? "0 3 * * *",
    { name: "draft-cleanup" },
  )
  async run(): Promise<void> {
    const retentionDays =
      this.configService.get<number>("draft.retentionDays") ?? 30;

    this.logger.log(
      `Draft cleanup job started (retentionDays=${retentionDays})`,
    );

    try {
      const { deletedCount } = await this.draftService.cleanupOldDrafts();

      if (deletedCount === 0) {
        this.logger.log("Draft cleanup complete — no stale drafts found");
      } else {
        this.logger.log(
          `Draft cleanup complete — deleted ${deletedCount} stale draft(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        "Draft cleanup job encountered an unexpected error",
        err instanceof Error ? err.stack : String(err),
      );
      // Do NOT re-throw: an uncaught exception would crash the scheduler
      // context and prevent the next invocation from firing.
    }
  }
}
