import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { InvoicesService } from "../invoices/invoices.service";
import { SorobanService } from "../soroban/soroban.service";
import { BackfillRunStatus, Prisma } from "@prisma/client";

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
  resumeFromRunId?: number;
  allowOverlap?: boolean;
  operator?: string;
}

export interface CancelRunOptions {
  runId: number;
  operator?: string;
  note?: string;
}

export interface BackfillCheckpointInfo {
  checkpointLedger: number;
  startLedgerRange: number;
  endLedgerRange: number;
  lastEventCursor?: string;
  lastEventId?: string;
  eventsInBatch: number;
  eventsProcessedBefore: number;
  eventsMatchedBefore: number;
  eventsSkippedBefore: number;
  eventsFailedBefore: number;
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

const RUNNING_STATUSES: BackfillRunStatus[] = [
  BackfillRunStatus.pending,
  BackfillRunStatus.running,
  BackfillRunStatus.paused,
];

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
    const stellarConfig = this.configService.get("stellar");
    this.contractId = stellarConfig?.sorobanContractId || "";
  }

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
      resumeFromRunId,
      allowOverlap = false,
      operator,
    } = options;

    if (!contractId) {
      throw new BadRequestException("Contract ID is required");
    }

    let resumeState: {
      parentRunId: number | undefined;
      resumeStartLedger: number;
      resumeCursor: string | undefined;
    } | null = null;

    if (resumeFromRunId != null) {
      resumeState = await this.prepareResume(contractId, resumeFromRunId);
    }

    let actualStartLedger = startLedger;

    if (resumeState) {
      actualStartLedger = resumeState.resumeStartLedger;
      this.logger.log(
        `Resuming from run ${resumeFromRunId} at ledger ${actualStartLedger}`,
      );
    } else if (fromLast) {
      const lastLedger = await this.getLastProcessedLedger(contractId);
      actualStartLedger = lastLedger ? lastLedger + 1 : 1;
      this.logger.log(
        `Starting from last processed ledger: ${lastLedger || "none"} → ${actualStartLedger}`,
      );
    }

    if (!actualStartLedger) {
      throw new BadRequestException(
        "startLedger is required unless using --from-last or --resume-from-run",
      );
    }

    let actualEndLedger = endLedger;
    if (!actualEndLedger) {
      try {
        actualEndLedger = await this.getLatestLedger();
        this.logger.log(`Using latest ledger: ${actualEndLedger}`);
      } catch (error) {
        this.logger.warn("Could not fetch latest ledger, using default range");
        actualEndLedger = actualStartLedger + 10000;
      }
    }

    if (!allowOverlap) {
      await this.preventOverlappingRun(
        contractId,
        actualStartLedger,
        actualEndLedger,
      );
    }

    const run = await this.prisma.backfillRun.create({
      data: {
        contractId,
        startLedger: BigInt(actualStartLedger),
        endLedger: BigInt(actualEndLedger),
        status: BackfillRunStatus.running,
        parentRunId: resumeState?.parentRunId,
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

    let cursor = resumeState?.resumeCursor;
    let cancelled = false;
    let finalStatus: BackfillRunStatus = BackfillRunStatus.completed;

    try {
      let currentLedger = actualStartLedger;

      while (currentLedger <= actualEndLedger) {
        cancelled = await this.isCancelled(run.id);
        if (cancelled) {
          finalStatus = BackfillRunStatus.cancelled;
          this.logger.log(
            `Backfill run ${run.id} cancelled by operator at ledger ${currentLedger}`,
          );
          break;
        }

        const batchEnd = Math.min(
          currentLedger + batchSize - 1, actualEndLedger,
        );

        this.logger.debug(
          `Fetching events for range: ${currentLedger} → ${batchEnd}`,
        );

        const result = await this.fetchEvents(
          currentLedger,
          batchEnd,
          contractId,
          cursor,
        );

        const events = result?.events || [];

        if (events.length === 0) {
          this.logger.debug(
            `No events found in range ${currentLedger} → ${batchEnd}`,
          );
          await this.saveCheckpoint({
            runId: run.id,
            contractId,
            checkpointLedger: batchEnd,
            startLedgerRange: currentLedger,
            endLedgerRange: batchEnd,
            lastEventCursor: cursor,
            lastEventId: undefined,
            eventsInBatch: 0,
            eventsProcessedBefore: stats.totalEvents,
            eventsMatchedBefore: stats.matched,
            eventsSkippedBefore: stats.skipped,
            eventsFailedBefore: stats.failed,
          });

          cursor = undefined;
          currentLedger = batchEnd + 1;
          continue;
        }

        stats.totalEvents += events.length;
        this.logger.log(
          `Found ${events.length} events in range ${currentLedger} → ${batchEnd}`,
        );

        for (const event of events) {
          cancelled = await this.isCancelled(run.id);
          if (cancelled) {
            break;
          }
          await this.processEvent(event, contractId, dryRun, stats);
        }

        if (result?.cursor) {
          cursor = result.cursor;
        }

        const lastEvent = events[events.length - 1];

        await this.saveCheckpoint({
          runId: run.id,
          contractId,
          checkpointLedger: batchEnd,
          startLedgerRange: currentLedger,
          endLedgerRange: batchEnd,
          lastEventCursor: cursor,
          lastEventId: lastEvent?.id || lastEvent?.pagingToken,
          eventsInBatch: events.length,
          eventsProcessedBefore: stats.totalEvents,
          eventsMatchedBefore: stats.matched,
          eventsSkippedBefore: stats.skipped,
          eventsFailedBefore: stats.failed,
        });

        await this.prisma.backfillRun.update({
          where: { id: run.id },
          data: {
            eventsProcessed: stats.totalEvents,
            eventsMatched: stats.matched,
            eventsSkipped: stats.skipped,
            eventsFailed: stats.failed,
          },
        });

        if (cancelled) {
          finalStatus = BackfillRunStatus.cancelled;
          this.logger.log(
            `Backfill run ${run.id} cancelled by operator at ledger ${batchEnd}`,
          );
          break;
        }

        cursor = undefined;
        currentLedger = batchEnd + 1;
      }

      if (!cancelled && stats.failed > 0) {
        finalStatus = BackfillRunStatus.failed;
      }

      const updateData: Prisma.BackfillRunUpdateInput = {
        completedAt: new Date(),
        status: finalStatus,
        eventsProcessed: stats.totalEvents,
        eventsMatched: stats.matched,
        eventsSkipped: stats.skipped,
        eventsFailed: stats.failed,
      };

      if (finalStatus === BackfillRunStatus.cancelled && operator) {
        updateData.cancelledAt = new Date();
        updateData.cancelledBy = operator;
      }

      await this.prisma.backfillRun.update({
        where: { id: run.id },
        data: updateData,
      });

      this.logger.log(
        `Backfill run ${run.id} ${finalStatus}. Matched: ${stats.matched}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`,
      );

      return { runId: run.id, stats };
    } catch (error) {
      await this.prisma.backfillRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: BackfillRunStatus.failed,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.error(`Backfill run ${run.id} failed:`, error);
      throw error;
    }
  }

  private async prepareResume(
    contractId: string,
    runId: number,
  ): Promise<{
      parentRunId: number;
      resumeStartLedger: number;
      resumeCursor: string | undefined;
    }> {
    const parentRun = await this.prisma.backfillRun.findUnique({
      where: { id: runId },
      include: {
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!parentRun) {
      throw new BadRequestException(`Run ${runId} not found`);
    }

    if (parentRun.contractId !== contractId) {
      throw new BadRequestException(
        `Run ${runId} belongs to a different contract`,
      );
    }

    if (RUNNING_STATUSES.includes(parentRun.status)) {
      throw new ConflictException(
        `Run ${runId} is still in status ${parentRun.status}. Cancel it first or use --allow-overlap.`,
      );
    }

    if (parentRun.status === BackfillRunStatus.completed) {
      throw new BadRequestException(
        `Run ${runId} is already completed; nothing to resume.`,
      );
    }

    const checkpoint = parentRun.checkpoints[0];
    const resumeStartLedger = checkpoint
      ? Number(checkpoint.checkpointLedger) + 1
      : Number(parentRun.startLedger);
    const resumeCursor = checkpoint?.lastEventCursor ?? undefined;

    this.logger.log(
      `Resuming run ${runId} from ledger ${resumeStartLedger} ${
        resumeCursor ? `(cursor: ${resumeCursor.slice(0, 12)}...)` : ""
      }`,
    );

    return {
      parentRunId: parentRun.id,
      resumeStartLedger,
      resumeCursor,
    };
  }

  private async preventOverlappingRun(
    contractId: string,
    startLedger: number,
    endLedger: number,
  ): Promise<void> {
    const overlapping = await this.prisma.backfillRun.findFirst({
      where: {
        contractId,
        status: { in: RUNNING_STATUSES },
        AND: [
          { startLedger: { lte: BigInt(endLedger) } },
          { endLedger: { gte: BigInt(startLedger) } },
        ],
      },
      select: {
        id: true,
        startLedger: true,
        endLedger: true,
        status: true,
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `Overlapping run detected: run ${overlapping.id} covers ${Number(overlapping.startLedger)} → ${Number(overlapping.endLedger)} (status: ${overlapping.status}). Cancel it first or pass allowOverlap=true.`,
      );
    }
  }

  private async isCancelled(runId: number): Promise<boolean> {
    const row = await this.prisma.backfillRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    return row?.status === BackfillRunStatus.cancelled;
  }

  private async saveCheckpoint(
    info: BackfillCheckpointInfo & { runId: number; contractId: string },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.backfillCheckpoint.create({
        data: {
          runId: info.runId,
          contractId: info.contractId,
          checkpointLedger: BigInt(info.checkpointLedger),
          startLedgerRange: BigInt(info.startLedgerRange),
          endLedgerRange: BigInt(info.endLedgerRange),
          lastEventCursor: info.lastEventCursor,
          lastEventId: info.lastEventId,
          eventsInBatch: info.eventsInBatch,
          eventsProcessedBefore: info.eventsProcessedBefore,
          eventsMatchedBefore: info.eventsMatchedBefore,
          eventsSkippedBefore: info.eventsSkippedBefore,
          eventsFailedBefore: info.eventsFailedBefore,
        },
      }),
      this.prisma.backfillRun.update({
        where: { id: info.runId },
        data: {
          lastCheckpointLedger: BigInt(info.checkpointLedger),
          lastCheckpointCursor: info.lastEventCursor,
          lastCheckpointAt: now,
        },
      }),
    ]);
  }

  async cancelRun(
    options: CancelRunOptions,
  ): Promise<{ id: number; status: BackfillRunStatus }> {
    const { runId, operator, note } = options;

    const run = await this.prisma.backfillRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, completedAt: true },
    });

    if (!run) {
      throw new BadRequestException(`Run ${runId} not found`);
    }

    if (run.status === BackfillRunStatus.completed) {
      throw new BadRequestException(
        `Run ${runId} is already completed and cannot be cancelled`,
      );
    }

    if (run.status === BackfillRunStatus.cancelled) {
      return { id: run.id, status: run.status };
    }

    const completedAt =
      run.status === BackfillRunStatus.running
        ? (run.completedAt ?? new Date())
        : undefined;

    const updated = await this.prisma.backfillRun.update({
      where: { id: runId },
      data: {
        status: BackfillRunStatus.cancelled,
        cancelledAt: new Date(),
        cancelledBy: operator,
        cancellationNote: note,
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
      select: { id: true, status: true },
    });

    this.logger.log(
      `Backfill run ${runId} cancelled by ${operator || "unknown"} ${note ? `(${note})` : ""}`,
    );

    return { id: updated.id, status: updated.status };
  }

  async getLatestCheckpoint(runId: number): Promise<any> {
    const run = await this.prisma.backfillRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        lastCheckpointLedger: true,
        lastCheckpointCursor: true,
        lastCheckpointAt: true,
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!run) {
      throw new BadRequestException(`Run ${runId} not found`);
    }

    return {
      runId: run.id,
      status: run.status,
      lastCheckpointLedger: run.lastCheckpointLedger
        ? Number(run.lastCheckpointLedger)
        : null,
      lastCheckpointCursor: run.lastCheckpointCursor,
      lastCheckpointAt: run.lastCheckpointAt,
      checkpoint: run.checkpoints[0]
        ? {
            id: run.checkpoints[0].id,
            checkpointLedger: Number(run.checkpoints[0].checkpointLedger),
            startLedgerRange: Number(run.checkpoints[0].startLedgerRange),
            endLedgerRange: Number(run.checkpoints[0].endLedgerRange),
            lastEventCursor: run.checkpoints[0].lastEventCursor,
            lastEventId: run.checkpoints[0].lastEventId,
            eventsInBatch: run.checkpoints[0].eventsInBatch,
            eventsProcessedBefore: run.checkpoints[0].eventsProcessedBefore,
            eventsMatchedBefore: run.checkpoints[0].eventsMatchedBefore,
            eventsSkippedBefore: run.checkpoints[0].eventsSkippedBefore,
            eventsFailedBefore: run.checkpoints[0].eventsFailedBefore,
            createdAt: run.checkpoints[0].createdAt,
          }
        : null,
    };
  }

  private async fetchEvents(
    startLedger: number,
    endLedger: number,
    contractId: string,
    cursor?: string,
  ): Promise<any> {
    const rpcUrl = this.configService.get("stellar")?.sorobanRpcUrl;
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured");
    }

    const topic =
      this.configService.get("stellar")?.sorobanEventTopic ||
      "InvoicePaymentRecorded";

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params: {
        startLedger,
        filters: [
          {
            type: "contract",
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

  private async processEvent(
    event: any,
    contractId: string,
    dryRun: boolean,
    stats: BackfillStats,
  ): Promise<void> {
    const eventId = event?.id || event?.pagingToken || `event-${Date.now()}`;
    const ledger = event?.ledger || event?.inLedger || 0;
    const txHash = event?.txHash || event?.transactionHash || eventId;

    let payload: {
      invoice_id?: string;
      payer?: string;
      asset_code?: string;
      asset_issuer?: string;
      amount?: string | number;
    } | null = null;

    try {
      payload = this.coercePaymentRecorded(event);
      const invoiceId = payload?.invoice_id;

      if (!invoiceId) {
        this.logger.warn(`Event ${eventId} has no invoice_id, skipping`);
        return;
      }

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

      if (!dryRun) {
        const result = await this.invoicesService.applySorobanPaymentEvent({
          eventId: String(eventId),
          contractId,
          ledger: Number(ledger),
          invoice_id: String(invoiceId),
          payer: payload?.payer ? String(payload.payer) : undefined,
          asset_code: payload?.asset_code
            ? String(payload.asset_code)
            : undefined,
          asset_issuer: payload?.asset_issuer
            ? String(payload.asset_issuer)
            : undefined,
          amount:
            payload?.amount !== undefined ? String(payload.amount) : undefined,
        });

        if (result) {
          stats.matched++;
          this.logger.log(`✓ Matched: Invoice ${invoiceId} updated to paid`);

          await this.prisma.processedEvent.create({
            data: {
              txHash: String(txHash),
              ledger: BigInt(ledger),
              invoiceId: String(invoiceId),
              contractId,
              status: "success",
            },
          });
        } else {
          stats.failed++;
          stats.failedEvents.push({
            invoiceId: String(invoiceId),
            eventId: String(eventId),
            error: "Invoice not found in database",
          });

          await this.prisma.processedEvent.create({
            data: {
              txHash: String(txHash),
              ledger: BigInt(ledger),
              invoiceId: String(invoiceId),
              contractId,
              status: "failed",
              errorMessage: "Invoice not found in database",
            },
          });
        }
      } else {
        stats.matched++;
        this.logger.debug(
          `[DRY RUN] Would process event ${eventId} for invoice ${invoiceId}`,
        );
      }
    } catch (error) {
      stats.failed++;
      stats.failedEvents.push({
        invoiceId: payload?.invoice_id || "unknown",
        eventId: String(eventId),
        error: error instanceof Error ? error.message : String(error),
      });

      if (!dryRun) {
        await this.prisma.processedEvent.create({
          data: {
            txHash: String(txHash),
            ledger: BigInt(ledger),
            invoiceId: payload?.invoice_id || "unknown",
            contractId,
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        });
      }

      this.logger.error(`Failed to process event ${eventId}:`, error);
    }
  }

  private coercePaymentRecorded(obj: any): {
    invoice_id?: string;
    payer?: string;
    asset_code?: string;
    asset_issuer?: string;
    amount?: string | number;
  } | null {
    if (!obj || typeof obj !== "object") return null;

    if ("invoice_id" in obj) {
      return obj;
    }

    const eventData = obj?.event?.value || obj?.value || obj?.data || obj?.body;

    if (eventData && typeof eventData === "object") {
      if ("invoice_id" in eventData) {
        return eventData;
      }

      if (Array.isArray(eventData)) {
        const result: Record<string, any> = {};
        for (const item of eventData) {
          const key = item?.key?.symbol || item?.key?.string || item?.key;
          const val =
            item?.val?.string ||
            item?.val?.address ||
            item?.val?.i128 ||
            item?.val?.u64 ||
            item?.val;
          if (key !== undefined) {
            result[String(key)] = val;
          }
        }
        if (result.invoice_id) {
          return result;
        }
      }
    }

    const topics = obj?.topics || obj?.topic || obj?.event?.topics || [];
    if (Array.isArray(topics) && topics.length >= 2) {
      return null;
    }

    return null;
  }

  private async getLastProcessedLedger(
    contractId: string,
  ): Promise<number | null> {
    const lastEvent = await this.prisma.processedEvent.findFirst({
      where: { contractId, status: "success" },
      orderBy: { ledger: "desc" },
      select: { ledger: true },
    });

    return lastEvent ? Number(lastEvent.ledger) : null;
  }

  private async getLatestLedger(): Promise<number> {
    const rpcUrl = this.configService.get("stellar")?.sorobanRpcUrl;
    if (!rpcUrl) {
      throw new Error("Soroban RPC URL not configured");
    }

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getNetwork",
      params: {},
    };

    const response = await this.postJson(rpcUrl, body);
    return response?.result?.latestLedger || 0;
  }

  private async postJson(rpcUrl: string, body: any): Promise<any> {
    const { default: fetch } = await import("node-fetch");
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getReport(runId: number): Promise<any> {
    return this.prisma.backfillRun.findUnique({
      where: { id: runId },
      include: {
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async getHistory(limit: number = 10): Promise<any[]> {
    return this.prisma.backfillRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  }

  async getStats(contractId?: string): Promise<any> {
    const where = contractId ? { contractId } : {};

    const [total, success, failed, skipped, lastLedger] = await Promise.all([
      this.prisma.processedEvent.count({ where }),
      this.prisma.processedEvent.count({
        where: { ...where, status: "success" },
      }),
      this.prisma.processedEvent.count({
        where: { ...where, status: "failed" },
      }),
      this.prisma.processedEvent.count({
        where: { ...where, status: "skipped" },
      }),
      this.prisma.processedEvent.findFirst({
        where: { ...where, status: "success" },
        orderBy: { ledger: "desc" },
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
