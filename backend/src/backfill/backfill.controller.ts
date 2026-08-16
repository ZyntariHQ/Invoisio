import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { BackfillService } from "./backfill.service";
import type {
  BackfillOptions,
  CancelRunOptions,
} from "./backfill.service";
import { Auth } from "../auth/guard/auth.guard";

@ApiTags("backfill")
@Auth()
@Controller("backfill")
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  @Post("reconcile")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Start a backfill reconciliation" })
  @ApiResponse({ status: 202, description: "Backfill started" })
  @ApiResponse({ status: 400, description: "Invalid parameters" })
  @ApiResponse({ status: 409, description: "Overlapping run already active" })
  async startBackfill(@Body() options: BackfillOptions) {
    if (
      !options.startLedger &&
      !options.fromLast &&
      options.resumeFromRunId == null
    ) {
      throw new BadRequestException(
        "One of startLedger, fromLast, or resumeFromRunId must be provided",
      );
    }

    const result = await this.backfillService.reconcile(options);
    return {
      success: true,
      runId: result.runId,
      stats: result.stats,
      message: "Backfill completed",
    };
  }

  @Post("cancel/:runId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel/stop a running or pending backfill run" })
  @ApiResponse({ status: 200, description: "Run marked as cancelled" })
  @ApiResponse({ status: 400, description: "Invalid run or already completed" })
  async cancelRun(
    @Param("runId") runId: string,
    @Body() body: CancelRunOptions | undefined,
  ) {
    const result = await this.backfillService.cancelRun({
      runId: parseInt(runId, 10),
      operator: body?.operator,
      note: body?.note,
    });
    return { success: true, ...result };
  }

  @Get("checkpoint/:runId")
  @ApiOperation({ summary: "Get latest checkpoint info for a run" })
  async getLatestCheckpoint(@Param("runId") runId: string) {
    return this.backfillService.getLatestCheckpoint(parseInt(runId, 10));
  }

  @Get("history")
  @ApiOperation({ summary: "Get backfill run history" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getHistory(@Query("limit") limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.backfillService.getHistory(limitNum);
  }

  @Get("report/:runId")
  @ApiOperation({ summary: "Get a specific backfill run report" })
  async getReport(@Param("runId") runId: string) {
    return this.backfillService.getReport(parseInt(runId, 10));
  }

  @Get("stats")
  @ApiOperation({ summary: "Get processed events statistics" })
  @ApiQuery({ name: "contractId", required: false, type: String })
  async getStats(@Query("contractId") contractId?: string) {
    return this.backfillService.getStats(contractId);
  }
}
