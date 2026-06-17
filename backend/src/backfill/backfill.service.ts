import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { SorobanService } from '../soroban/soroban.service';
import { Prisma } from '@prisma/client';

export interface BackfillStats {
  totalEvents: number;
  matched: number;
  skipped: number;
  failed: number;
  failedEvents: Array<{
    invoiceId: string;
    eventId: string;
    error: string;
  }>;
}

export interface BackfillOptions {
  startLedger?: number;
  endLedger?: number;
  dryRun?: boolean;
  fromLast?: boolean;
  batchSize?: number;
  contractId?: string;
}

export interface SorobanEvent {
  id: string;
  ledger: number;
  txHash?: string;
  pagingToken?: string;
  event: {
    topics: any[];
    value: any;
  };
  body?: any;
}

@Injectable()
export class BackfillService {
  private readonly logger = new Logger(BackfillService.name);
  private readonly contractId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {
    const stellarConfig = this.configService.get('stellar');
    this.contractId = stellarConfig?.sorobanContractId || '';
  }

  /**
   * Main backfill/reconciliation function
   */
  async reconcile(options: BackfillOptions): Promise<{
    runId: number;
    stats: BackfillStats;
  }> {
    const {
      startLedger,
      endLedger,
      dryRun = false,
      fromLast = false,
      batchSize = 100,
      contractId = this.contractId,
    } = options;

    if (!contractId) {
      throw new BadRequestException('Contract ID is required');
    }

    // Determine start ledger
    let actualStartLedger = startLedger;
    if (fromLast) {
      const lastLedger = await this.getLastProcessedLedger(contractId);
      actualStartLedger = lastLedger ? lastLedger + 1 : 1;
      this.logger.log(
        `Starting from last processed ledger: ${lastLedger || 'none'} → ${actualStartLedger}`,
      );
    }

    if (!actualStartLedger) {
      throw new BadRequestException(
        'startLedger is required unless using --from-last',
      );
    }

    // Get end ledger (latest if not specified)
    let actualEndLedger = endLedger;
    if (!actualEndLedger) {
      try {
        actualEndLedger = await this.getLatestLedger();
        this.logger.log(`Using latest ledger: ${actualEndLedger}`);
      } catch (error) {
        this.logger.warn('Could not fetch latest ledger, using default range');
        actualEndLedger = actualStartLedger + 10000;
      }
    }

    // Create backfill run record
    const run = await this.prisma.backfillRun.create({
      data: {
        startLedger: BigInt(actualStartLedger),
        endLedger: BigInt(actualEndLedger),
        status: 'running',
      },
    });

    this.logger.log(
      `Backfill run ${run.id} started (${actualStartLedger} → ${actualEndLedger})`,
    );

    const stats: BackfillStats = {
      totalEvents: 0,
      matched: 0,
      skipped: 0,
      failed: 0,
      failedEvents: [],
    };

    try {
      // Fetch events in batches
      let currentLedger = actualStartLedger;
      let hasMore = true;
      let cursor: string | undefined;

      while (hasMore && currentLedger <= actualEndLedger) {
        const batchEnd = Math.min(currentLedger + batchSize, actualEndLedger);

        this.logger.debug(`Fetching events for range: ${currentLedger} → ${batchEnd}`);

        // Fetch events using the same logic as SorobanEventsService
        const result = await this.fetchEvents(
          currentLedger,
          batchEnd,
          contractId,
          cursor,
        );

        const events = result?.events || [];

        if (events.length === 0) {
          this.logger.debug(`No events found in range ${currentLedger} → ${batchEnd}`);
          currentLedger = batchEnd + 1;
          continue;
        }

        stats.totalEvents += events.length;
        this.logger.log(`Found ${events.length} events in range ${currentLedger} → ${batchEnd}`);

        // Process each event
        for (const event of events) {
          await this.processEvent(event, contractId, dryRun, stats);
        }

        // Update cursor if available
        if (result?.cursor) {
          cursor = result.cursor;
        }

        // Update run progress
        await this.prisma.backfillRun.update({
          where: { id: run.id },
          data: {
            eventsProcessed: stats.totalEvents,
            eventsMatched: stats.matched,
            eventsSkipped: stats.skipped,
            eventsFailed: stats.failed,
          },
        });

        currentLedger = batchEnd + 1;
      }

      // Complete the run
      await this.prisma.backfillRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: stats.failed > 0 ? 'failed' : 'completed',
          eventsProcessed: stats.totalEvents,
          eventsMatched: stats.matched,
          eventsSkipped: stats.skipped,
          eventsFailed: stats.failed,
        },
      });

      this.logger.log(
        `Backfill run ${run.id} complete. Matched: ${stats.matched}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`,
      );

      return { runId: run.id, stats };
    } catch (error) {
      // Mark run as failed
      await this.prisma.backfillRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.error(`Backfill run ${run.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Fetch events from Soroban RPC
   */
  private async fetchEvents(
    startLedger: number,
    endLedger: number,
    contractId: string,
    cursor?: string,
  ): Promise<any> {
    // Use the same HTTP request pattern as SorobanEventsService
    const rpcUrl = this.configService.get('stellar')?.sorobanRpcUrl;
    if (!rpcUrl) {
      throw new Error('Soroban RPC URL not configured');
    }

    const topic = this.configService.get('stellar')?.sorobanEventTopic || 'InvoicePaymentRecorded';

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getEvents',
      params: {
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [contractId],
            topics: [[topic]],
          },
        ],
        ...(cursor ? { cursor } : {}),
        limit: 100,
      },
    };

    const response = await this.postJson(rpcUrl, body);
    return response?.result || null;
  }

  /**
   * Process a single event using the same logic as SorobanEventsService
   */
  private async processEvent(
    event: any,
    contractId: string,
    dryRun: boolean,
    stats: BackfillStats,
  ): Promise<void> {
    const eventId = event?.id || event?.pagingToken || `event-${Date.now()}`;
    const ledger = event?.ledger || event?.inLedger || 0;
    const txHash = event?.txHash || event?.transactionHash || eventId;

    // Declare payload outside try block so it's accessible in catch
    let payload: {
      invoice_id?: string;
      payer?: string;
      asset_code?: string;
      asset_issuer?: string;
      amount?: string | number;
    } | null = null;

    try {
      // Extract invoice_id from the event
      payload = this.coercePaymentRecorded(event);
      const invoiceId = payload?.invoice_id;

      if (!invoiceId) {
        this.logger.warn(`Event ${eventId} has no invoice_id, skipping`);
        return;
      }

      // Check if already processed
      const exists = await this.prisma.processedEvent.findUnique({
        where: {
          txHash_invoiceId_contractId: {
            txHash: String(txHash),
            invoiceId: String(invoiceId),
            contractId,
          },
        },
      });

      if (exists) {
        stats.skipped++;
        this.logger.debug(`Event ${eventId} already processed, skipping`);
        return;
      }

      // Apply the event using the existing invoices service
      if (!dryRun) {
        const result = await this.invoicesService.applySorobanPaymentEvent({
          eventId: String(eventId),
          contractId,
          ledger: Number(ledger),
          invoice_id: String(invoiceId),
          payer: payload?.payer ? String(payload.payer) : undefined,
          asset_code: payload?.asset_code ? String(payload.asset_code) : undefined,
          asset_issuer: payload?.asset_issuer ? String(payload.asset_issuer) : undefined,
          amount: payload?.amount !== undefined ? String(payload.amount) : undefined,
        });

        if (result) {
          stats.matched++;
          this.logger.log(`✓ Matched: Invoice ${invoiceId} updated to paid`);

          // Record as processed
          await this.prisma.processedEvent.create({
            data: {
              txHash: String(txHash),
              ledger: BigInt(ledger),
              invoiceId: String(invoiceId),
              contractId,
              status: 'success',
            },
          });
        } else {
          // Invoice not found
          stats.failed++;
          stats.failedEvents.push({
            invoiceId: String(invoiceId),
            eventId: String(eventId),
            error: 'Invoice not found in database',
          });

          await this.prisma.processedEvent.create({
            data: {
              txHash: String(txHash),
              ledger: BigInt(ledger),
              invoiceId: String(invoiceId),
              contractId,
              status: 'failed',
              errorMessage: 'Invoice not found in database',
            },
          });
        }
      } else {
        // Dry run
        stats.matched++;
        this.logger.debug(`[DRY RUN] Would process event ${eventId} for invoice ${invoiceId}`);
      }
    } catch (error) {
      stats.failed++;
      stats.failedEvents.push({
        invoiceId: payload?.invoice_id || 'unknown',
        eventId: String(eventId),
        error: error instanceof Error ? error.message : String(error),
      });

      if (!dryRun) {
        await this.prisma.processedEvent.create({
          data: {
            txHash: String(txHash),
            ledger: BigInt(ledger),
            invoiceId: payload?.invoice_id || 'unknown',
            contractId,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      }

      this.logger.error(`Failed to process event ${eventId}:`, error);
    }
  }

  /**
   * Extract payment data from event - copied from SorobanEventsService
   */
  private coercePaymentRecorded(obj: any): {
    invoice_id?: string;
    payer?: string;
    asset_code?: string;
    asset_issuer?: string;
    amount?: string | number;
  } | null {
    if (!obj || typeof obj !== 'object') return null;

    // Check if it's already in the right format
    if ('invoice_id' in obj) {
      return obj;
    }

    // Check nested event structure
    const eventData = obj?.event?.value || obj?.value || obj?.data || obj?.body;

    if (eventData && typeof eventData === 'object') {
      if ('invoice_id' in eventData) {
        return eventData;
      }

      // Handle array format from contract events
      if (Array.isArray(eventData)) {
        const result: Record<string, any> = {};
        for (const item of eventData) {
          const key = item?.key?.symbol || item?.key?.string || item?.key;
          const val = item?.val?.string || item?.val?.address || item?.val?.i128 || item?.val?.u64 || item?.val;
          if (key !== undefined) {
            result[String(key)] = val;
          }
        }
        if (result.invoice_id) {
          return result;
        }
      }
    }

    // Try to extract from topics
    const topics = obj?.topics || obj?.topic || obj?.event?.topics || [];
    if (Array.isArray(topics) && topics.length >= 2) {
      // If topics contain the event data, try to parse it
      // This is a simplified approach - actual parsing depends on event format
      return null;
    }

    return null;
  }

  /**
   * Get the last processed ledger for a contract
   */
  private async getLastProcessedLedger(contractId: string): Promise<number | null> {
    const lastEvent = await this.prisma.processedEvent.findFirst({
      where: { contractId, status: 'success' },
      orderBy: { ledger: 'desc' },
      select: { ledger: true },
    });

    return lastEvent ? Number(lastEvent.ledger) : null;
  }

  /**
   * Get the latest ledger from Soroban RPC
   */
  private async getLatestLedger(): Promise<number> {
    const rpcUrl = this.configService.get('stellar')?.sorobanRpcUrl;
    if (!rpcUrl) {
      throw new Error('Soroban RPC URL not configured');
    }

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getNetwork',
      params: {},
    };

    const response = await this.postJson(rpcUrl, body);
    return response?.result?.latestLedger || 0;
  }

  /**
   * HTTP POST helper - copied from SorobanEventsService
   */
  private async postJson(rpcUrl: string, body: any): Promise<any> {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get backfill run report
   */
  async getReport(runId: number): Promise<any> {
    return this.prisma.backfillRun.findUnique({
      where: { id: runId },
    });
  }

  /**
   * Get backfill history
   */
  async getHistory(limit: number = 10): Promise<any[]> {
    return this.prisma.backfillRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get statistics about processed events
   */
  async getStats(contractId?: string): Promise<any> {
    const where = contractId ? { contractId } : {};

    const [total, success, failed, skipped, lastLedger] = await Promise.all([
      this.prisma.processedEvent.count({ where }),
      this.prisma.processedEvent.count({ where: { ...where, status: 'success' } }),
      this.prisma.processedEvent.count({ where: { ...where, status: 'failed' } }),
      this.prisma.processedEvent.count({ where: { ...where, status: 'skipped' } }),
      this.prisma.processedEvent.findFirst({
        where: { ...where, status: 'success' },
        orderBy: { ledger: 'desc' },
        select: { ledger: true },
      }),
    ]);

    return {
      total,
      success,
      failed,
      skipped,
      lastProcessedLedger: lastLedger ? Number(lastLedger.ledger) : null,
    };
  }
}