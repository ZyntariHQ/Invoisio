import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health module for service status checks
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
