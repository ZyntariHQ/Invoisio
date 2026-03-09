import { Module } from "@nestjs/common";
import * as Joi from "joi";
import { ConfigModule, ConfigService } from "@nestjs/config";

// Configuration
import appConfig from "./config/app.config";
import stellarConfig from "./config/stellar.config";
import throttlerConfig from "./config/throttler.config";

// Modules
import { HealthModule } from "./health/health.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { StellarModule } from "./stellar/stellar.module";
import { HorizonWatcherModule } from "./stellar/horizon-watcher.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/user.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ScheduleModule } from "@nestjs/schedule";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { CustomThrottlerModule } from "./throttler/throttler.module";

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
      load: [appConfig, stellarConfig, throttlerConfig],
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
        DATABASE_URL: Joi.string().optional(),
        JWT_SECRET: Joi.string().optional(),
        // Rate limiting configuration
        THROTTLE_TTL: Joi.number().integer().min(1).default(60),
        THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
        THROTTLE_AUTH_TTL: Joi.number().integer().min(1).default(900),
        THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(5),
        THROTTLE_INVOICE_TTL: Joi.number().integer().min(1).default(3600),
        THROTTLE_INVOICE_LIMIT: Joi.number().integer().min(1).default(20),
        REDIS_HOST: Joi.string().default("localhost"),
        REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
        REDIS_PASSWORD: Joi.string().optional(),
        REDIS_DB: Joi.number().integer().min(0).default(0),
        REDIS_KEY_PREFIX: Joi.string().default("invoisio:throttle:"),
      }),
    }),
    CustomThrottlerModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    HealthModule,
    InvoicesModule,
    StellarModule,
    HorizonWatcherModule,
    AuthModule,
    UsersModule,
    WebhooksModule,
  ],
})
export class AppModule {}
