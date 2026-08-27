#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackfillService } from '../src/backfill/backfill.service';
import { Command } from 'commander';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const backfillService = app.get(BackfillService);
  const program = new Command();

  program
    .name('backfill')
    .description('Backfill invoice payment states from Soroban events')
    .version('1.0.0');

  program
    .command('reconcile')
    .description('Reconcile historical invoice payments')
    .option('-s, --start-ledger <number>', 'Starting ledger', parseInt)
    .option('-e, --end-ledger <number>', 'Ending ledger', parseInt)
    .option('--dry-run', 'Simulate without writing to database')
    .option('--from-last', 'Start from last processed ledger')
    .option('--batch-size <number>', 'Batch size for fetching events', parseInt, 100)
    .option('--resume-from-run <number>', 'Resume a previous failed/cancelled run by ID', parseInt)
    .option('--allow-overlap', 'Allow overlapping range with an existing running/paused run')
    .option('--operator <name>', 'Operator identifier (for audit trail on cancel)')
    .action(async (options) => {
      try {
        console.log('\n🚀 Starting backfill reconciliation...\n');

        const result = await backfillService.reconcile({
          startLedger: options.startLedger,
          endLedger: options.endLedger,
          dryRun: options.dryRun,
          fromLast: options.fromLast,
          batchSize: options.batchSize,
          resumeFromRunId: options.resumeFromRun,
          allowOverlap: options.allowOverlap,
          operator: options.operator,
        });

        console.log('\n✅ Backfill complete!');
        console.log(`   Run ID: ${result.runId}`);
        console.log(`   Total Events: ${result.stats.totalEvents}`);
        console.log(`   ✓ Matched: ${result.stats.matched}`);
        console.log(`   → Skipped: ${result.stats.skipped}`);
        console.log(`   ✗ Failed: ${result.stats.failed}`);

        if (result.stats.failedEvents.length > 0) {
          console.log('\n⚠️  Failed Events:');
          for (const failed of result.stats.failedEvents) {
            console.log(`   - ${failed.invoiceId}: ${failed.error}`);
          }
        }

        console.log('\n📊 Report saved. View with: npm run backfill:report', result.runId);
      } catch (error: any) {
        console.error('\n❌ Backfill failed:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  program
    .command('cancel <runId>')
    .description('Stop/cancel a running or pending backfill run')
    .option('--operator <name>', 'Operator identifier (audited)')
    .option('--note <text>', 'Reason for cancellation (audited)')
    .action(async (runId, options) => {
      try {
        const result = await backfillService.cancelRun({
          runId: parseInt(runId, 10),
          operator: options.operator,
          note: options.note,
        });

        console.log(`\n🛑 Run ${result.id} marked as ${result.status}`);
        console.log('   Use `backfill checkpoint <runId>` to inspect last progress.');
      } catch (error: any) {
        console.error('Error cancelling run:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  program
    .command('checkpoint <runId>')
    .description('Inspect the latest checkpoint for a run')
    .action(async (runId) => {
      try {
        const info = await backfillService.getLatestCheckpoint(parseInt(runId, 10));

        console.log('\n📍 Checkpoint Status');
        console.log('═══════════════════════════════════════');
        console.log(`  Run ID:         ${info.runId}`);
        console.log(`  Status:         ${info.status}`);
        console.log(`  Last ledger:    ${info.lastCheckpointLedger ?? 'N/A'}`);
        console.log(`  Checkpoint at:  ${info.lastCheckpointAt ?? 'N/A'}`);
        console.log(`  Cursor saved:   ${info.lastCheckpointCursor ? 'yes' : 'no'}`);

        if (info.checkpoint) {
          console.log(`\n  Last checkpoint range: ${info.checkpoint.startLedgerRange} → ${info.checkpoint.endLedgerRange}`);
          console.log(`  Events in batch:       ${info.checkpoint.eventsInBatch}`);
          console.log(`  Events before batch:`);
          console.log(`    - Processed: ${info.checkpoint.eventsProcessedBefore}`);
          console.log(`    - Matched:   ${info.checkpoint.eventsMatchedBefore}`);
          console.log(`    - Skipped:   ${info.checkpoint.eventsSkippedBefore}`);
          console.log(`    - Failed:    ${info.checkpoint.eventsFailedBefore}`);
          if (info.checkpoint.lastEventId) {
            console.log(`  Last event id:  ${info.checkpoint.lastEventId}`);
          }
          console.log(`  Checkpoint saved: ${info.checkpoint.createdAt}`);
        } else {
          console.log('\n  (no checkpoints saved yet)');
        }
      } catch (error: any) {
        console.error('Error fetching checkpoint:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  program
    .command('report <runId>')
    .description('Get a backfill run report')
    .action(async (runId) => {
      try {
        const report: any = await backfillService.getReport(parseInt(runId, 10));
        console.log('\n📊 Backfill Report');
        console.log('═══════════════════════════════════════');
        console.log(`  Run ID: ${report.id}`);
        console.log(`  Status: ${report.status}`);
        console.log(`  Contract: ${report.contractId}`);
        console.log(`  Started: ${report.startedAt}`);
        console.log(`  Completed: ${report.completedAt || 'N/A'}`);
        console.log(`  Range: ${report.startLedger} → ${report.endLedger}`);
        console.log(`  Last Checkpoint Ledger: ${report.lastCheckpointLedger ?? 'N/A'}`);
        if (report.lastCheckpointAt) {
          console.log(`  Last Checkpoint At: ${report.lastCheckpointAt}`);
        }
        console.log(`  Total: ${report.eventsProcessed}`);
        console.log(`  Matched: ${report.eventsMatched}`);
        console.log(`  Skipped: ${report.eventsSkipped}`);
        console.log(`  Failed: ${report.eventsFailed}`);
        if (report.cancelledAt) {
          console.log(`  Cancelled: ${report.cancelledAt} (by ${report.cancelledBy ?? 'unknown'})`);
          if (report.cancellationNote) {
            console.log(`  Cancellation note: ${report.cancellationNote}`);
          }
        }
        if (report.parentRunId) {
          console.log(`  Resumed from run: ${report.parentRunId}`);
        }
        if (report.errorMessage) {
          console.log(`  Error: ${report.errorMessage}`);
        }
        if (report.checkpoints?.length) {
          console.log(`\n  Recent checkpoints (${report.checkpoints.length}):`);
          for (const cp of report.checkpoints) {
            console.log(`    - ledger ${Number(cp.checkpointLedger)} @ ${cp.createdAt} (${cp.eventsInBatch} evts)`);
          }
        }
      } catch (error: any) {
        console.error('Error fetching report:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  program
    .command('stats')
    .description('Get processed events statistics')
    .action(async () => {
      try {
        const stats = await backfillService.getStats();
        console.log('\n📊 Processed Events Statistics');
        console.log('═══════════════════════════════════════');
        console.log(`  Total: ${stats.total}`);
        console.log(`  Success: ${stats.success}`);
        console.log(`  Skipped: ${stats.skipped}`);
        console.log(`  Failed: ${stats.failed}`);
        console.log(`  Last Processed Ledger: ${stats.lastProcessedLedger || 'N/A'}`);
      } catch (error: any) {
        console.error('Error fetching stats:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  program
    .command('history [limit]')
    .description('Show recent backfill runs')
    .action(async (limit) => {
      try {
        const rows = await backfillService.getHistory(
          limit ? parseInt(limit, 10) : undefined,
        );
        console.log('\n🕓 Backfill History');
        console.log('═══════════════════════════════════════');
        for (const r of rows as any[]) {
          const statusCol = String(r.status).padEnd(10);
          const range = `${String(r.startLedger).padStart(8)} → ${String(r.endLedger).padStart(8)}`;
          console.log(`  #${String(r.id).padStart(4)}  ${statusCol}  ${range}  ${r.startedAt}`);
        }
      } catch (error: any) {
        console.error('Error fetching history:', error?.message || error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  await program.parseAsync(process.argv);
}

bootstrap();
