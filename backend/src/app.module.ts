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
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/user.module";
import { TypeOrmModule } from "@nestjs/typeorm";

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
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        if (process.env.NODE_ENV === "test") {
          return {
            type: "sqlite",
            database: ":memory:",
            autoLoadEntities: true,
            synchronize: true,
          };
        }

        return {
          type: "postgres",
          host: configService.get<string>("DATABASE_HOST"),
          port: parseInt(configService.get<string>("DATABASE_PORT")!, 10),
          username: configService.get<string>("DATABASE_USER"),
          password: configService.get<string>("DATABASE_PASSWORD"),
          database: configService.get<string>("DATABASE_NAME"),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
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
        MERCHANT_PUBLIC_KEY: Joi.string().optional(),
        USDC_ISSUER: Joi.string().default(
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        ),
        USDC_ASSET_CODE: Joi.string().default("USDC"),
        MEMO_PREFIX: Joi.string().default("invoisio-"),
        DATABASE_URL: Joi.string().optional(),
        JWT_SECRET: Joi.string().optional(),
      }),
    }),
    HealthModule,
    InvoicesModule,
    StellarModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
