import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { StellarModule } from "../stellar/stellar.module";

/**
 * Health module for liveness and readiness checks.
 *
 * Imports StellarModule (which provides both StellarService and SorobanService)
 * and injects the global PrismaService for database connectivity checks.
 */
@Module({
  imports: [ConfigModule, StellarModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
