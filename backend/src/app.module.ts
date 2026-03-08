import { Module } from "@nestjs/common";
import * as Joi from "joi";
import { ConfigModule, ConfigService } from "@nestjs/config";

// Configuration
import appConfig from "./config/app.config";
import stellarConfig from "./config/stellar.config";

// Modules
import { HealthModule } from "./health/health.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { StellarModule } from "./stellar/stellar.module";
import { HorizonWatcherModule } from "./stellar/horizon-watcher.module";
import { SorobanEventsModule } from "./stellar/soroban-events.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/user.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ScheduleModule } from "@nestjs/schedule";
import { WebhooksModule } from "./webhooks/webhooks.module";

/**
 * Root application module
 *
 * Configures:
 * - Global configuration with validation
 * - Health checks
 * - Invoice management
 * - Stellar integration (stubbed)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.example"],
      load: [appConfig, stellarConfig],
      validationSchema: Joi.object({
        PORT: Joi.number().default(3001),
        CORS_ORIGIN: Joi.string().default("http://localhost:3000"),
        HORIZON_URL: Joi.string()
          .uri()
          .default("https://horizon-testnet.stellar.org"),
        STELLAR_NETWORK_PASSPHRASE: Joi.string().default(
          "Test SDF Network ; September 2015",
        ),
        MERCHANT_PUBLIC_KEY: Joi.string().optional().allow(""),
        USDC_ISSUER: Joi.string().default(
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        ),
        USDC_ASSET_CODE: Joi.string().default("USDC"),
        MEMO_PREFIX: Joi.string().default("invoisio-"),
        HORIZON_POLL_INTERVAL: Joi.number().integer().min(1000).default(15000),
        SOROBAN_RPC_URL: Joi.string()
          .uri()
          .default("https://soroban-testnet.stellar.org"),
        SOROBAN_CONTRACT_ID: Joi.string().optional().allow(""),
        SOROBAN_EVENT_TOPIC: Joi.string().default("InvoicePaymentRecorded"),
        DATABASE_URL: Joi.string().optional(),
        JWT_SECRET: Joi.string().optional(),
      }),
    }),
    PrismaModule,
    ScheduleModule.forRoot(),
    HealthModule,
    InvoicesModule,
    StellarModule,
    HorizonWatcherModule,
    SorobanEventsModule,
    AuthModule,
    UsersModule,
    WebhooksModule,
  ],
})
export class AppModule {}
