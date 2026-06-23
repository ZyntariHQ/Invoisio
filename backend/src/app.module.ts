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
import { SorobanEventsModule } from "./stellar/soroban-events.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/user.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ScheduleModule } from "@nestjs/schedule";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { CustomThrottlerModule } from "./throttler/throttler.module";
import { BackfillModule } from "./backfill/backfill.module";
import { AdminAnalyticsModule } from "./admin-analytics/admin-analytics.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MerchantModule } from "./merchant/merchant.module";

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
        SOROBAN_RPC_URL: Joi.string()
          .uri()
          .default("https://soroban-testnet.stellar.org"),
        SOROBAN_CONTRACT_ID: Joi.string().optional().allow(""),
        SOROBAN_EVENT_TOPIC: Joi.string().default("InvoicePaymentRecorded"),
        DATABASE_URL: Joi.string().required().messages({
          "any.required":
            "DATABASE_URL is required – set it to your database connection string (e.g. postgresql://user:pass@host:5432/db)",
          "string.empty":
            "DATABASE_URL must not be empty – set it to your database connection string",
        }),
        JWT_SECRET: Joi.string().min(32).required().messages({
          "any.required":
            "JWT_SECRET is required – generate one with: openssl rand -base64 32",
          "string.min":
            "JWT_SECRET must be at least 32 characters long – generate one with: openssl rand -base64 32",
          "string.empty":
            "JWT_SECRET must not be empty – generate one with: openssl rand -base64 32",
        }),
        // Rate limiting configuration
        THROTTLE_TTL: Joi.number().integer().min(1).default(60),
        THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
        THROTTLE_AUTH_TTL: Joi.number().integer().min(1).default(900),
        THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(5),
        THROTTLE_INVOICE_TTL: Joi.number().integer().min(1).default(3600),
        THROTTLE_INVOICE_LIMIT: Joi.number().integer().min(1).default(20),
        REDIS_HOST: Joi.string().default("localhost"),
        REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
        REDIS_PASSWORD: Joi.string().optional().allow(""),
        REDIS_DB: Joi.number().integer().min(0).default(0),
        REDIS_KEY_PREFIX: Joi.string().default("invoisio:throttle:"),
        EMAIL_PROVIDER: Joi.string()
          .valid("console", "smtp")
          .default("console"),
        EMAIL_FROM: Joi.string().default("Invoisio <no-reply@invoisio.app>"),
        APP_BASE_URL: Joi.string().uri().default("http://localhost:3000"),
        SMTP_HOST: Joi.string().optional().allow(""),
        SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
        SMTP_SECURE: Joi.boolean().default(false),
        SMTP_USER: Joi.string().optional().allow(""),
        SMTP_PASS: Joi.string().optional().allow(""),
      }),
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    CustomThrottlerModule,
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
    BackfillModule,
    AdminAnalyticsModule,
    NotificationsModule,
    MerchantModule,
  ],
})
export class AppModule {}
