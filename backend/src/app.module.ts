import * as Joi from "joi";
import { ConfigModule, ConfigService } from "@nestjs/config";

// Configuration
import appConfig from "./config/app.config";
import stellarConfig from "./config/stellar.config";
import throttlerConfig from "./config/throttler.config";
import observabilityConfig from "./config/observability.config";
import { ObservabilityModule } from "./observability/observability.module";

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
import { MerchantsModule } from "./merchants/merchants.module";
import { BackfillModule } from "./backfill/backfill.module";
import { CustomersModule } from "./customers/customers.module";
import { InvoiceEngagementModule } from "./invoice-engagement/invoice-engagement.module";
import { RecurringBillingModule } from "./recurring-billing/recurring-billing.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AdminAnalyticsModule } from "./admin-analytics/admin-analytics.module";
import { ActivityFeedModule } from "./activity-feed/activity-feed.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { CustomThrottlerModule } from "./throttler/throttler.module";
import { PrismaService } from "./prisma/prisma.service";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [appConfig, stellarConfig, throttlerConfig, observabilityConfig],
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
        SLOW_DB_THRESHOLD_MS: Joi.number().integer().min(1).default(200),
        SLOW_NETWORK_THRESHOLD_MS: Joi.number().integer().min(1).default(500),
        // Soroban Anchoring Configuration - FAIL FAST when enabled
        SOROBAN_ANCHORING_ENABLED: Joi.boolean().default(false),
        SOROBAN_CONTRACT_ID: Joi.when("SOROBAN_ANCHORING_ENABLED", {
          is: true,
          then: Joi.string().min(56).required().messages({
            "any.required":
              "SOROBAN_CONTRACT_ID is required when SOROBAN_ANCHORING_ENABLED=true",
            "string.min":
              "SOROBAN_CONTRACT_ID must be a valid Stellar contract ID (56+ characters)",
            "string.empty":
              "SOROBAN_CONTRACT_ID must not be empty when SOROBAN_ANCHORING_ENABLED=true",
          }),
          otherwise: Joi.string().optional().allow(""),
        }),
        ADMIN_SECRET_KEY: Joi.when("SOROBAN_ANCHORING_ENABLED", {
          is: true,
          then: Joi.string().min(56).required().messages({
            "any.required":
              "ADMIN_SECRET_KEY is required when SOROBAN_ANCHORING_ENABLED=true",
            "string.min":
              "ADMIN_SECRET_KEY must be a valid Stellar secret key (56+ characters)",
            "string.empty":
              "ADMIN_SECRET_KEY must not be empty when SOROBAN_ANCHORING_ENABLED=true",
          }),
          otherwise: Joi.string().optional().allow(""),
        }),
        // SOROBAN_SECRET_KEY (deprecated - kept for backward compatibility)
        SOROBAN_SECRET_KEY: Joi.string().optional().allow(""),
      }),
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    ObservabilityModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    HealthModule,
    InvoicesModule,
    StellarModule,
    HorizonWatcherModule,
    SorobanEventsModule,
    AuthModule,
    UsersModule,
    MerchantsModule,
    WebhooksModule,
    BackfillModule,
    CustomersModule,
    InvoiceEngagementModule,
    RecurringBillingModule,
    NotificationsModule,
    AdminAnalyticsModule,
    ActivityFeedModule,
    RealtimeModule,
    CustomThrottlerModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
