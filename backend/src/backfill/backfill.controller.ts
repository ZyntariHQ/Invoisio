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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BackfillService } from './backfill.service';
import type { BackfillOptions } from './backfill.service';

@ApiTags('backfill')
@Controller('backfill')
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a backfill reconciliation' })
  @ApiResponse({ status: 202, description: 'Backfill started' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async startBackfill(@Body() options: BackfillOptions) {
    if (!options.startLedger && !options.fromLast) {
      throw new BadRequestException(
        'Either startLedger or fromLast must be provided',
      );
    }

    const result = await this.backfillService.reconcile(options);
    return {
      success: true,
      runId: result.runId,
      stats: result.stats,
      message: 'Backfill started successfully',
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get backfill run history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.backfillService.getHistory(limitNum);
  }

  @Get('report/:runId')
  @ApiOperation({ summary: 'Get a specific backfill run report' })
  async getReport(@Param('runId') runId: string) {
    return this.backfillService.getReport(parseInt(runId, 10));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get processed events statistics' })
  @ApiQuery({ name: 'contractId', required: false, type: String })
  async getStats(@Query('contractId') contractId?: string) {
    return this.backfillService.getStats(contractId);
  }
}