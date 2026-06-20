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
    .action(async (options) => {
      try {
        console.log('\n🚀 Starting backfill reconciliation...\n');

        const result = await backfillService.reconcile({
          startLedger: options.startLedger,
          endLedger: options.endLedger,
          dryRun: options.dryRun,
          fromLast: options.fromLast,
          batchSize: options.batchSize,
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
      } catch (error) {
        console.error('\n❌ Backfill failed:', error);
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
        const report = await backfillService.getReport(parseInt(runId, 10));
        console.log('\n📊 Backfill Report');
        console.log('═══════════════════════════════════════');
        console.log(`  Run ID: ${report.id}`);
        console.log(`  Status: ${report.status}`);
        console.log(`  Started: ${report.startedAt}`);
        console.log(`  Completed: ${report.completedAt || 'N/A'}`);
        console.log(`  Range: ${report.startLedger} → ${report.endLedger}`);
        console.log(`  Total: ${report.eventsProcessed}`);
        console.log(`  Matched: ${report.eventsMatched}`);
        console.log(`  Skipped: ${report.eventsSkipped}`);
        console.log(`  Failed: ${report.eventsFailed}`);
        if (report.errorMessage) {
          console.log(`  Error: ${report.errorMessage}`);
        }
      } catch (error) {
        console.error('Error fetching report:', error);
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
      } catch (error) {
        console.error('Error fetching stats:', error);
        process.exit(1);
      } finally {
        await app.close();
      }
    });

  await program.parseAsync(process.argv);
}

bootstrap();