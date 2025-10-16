import { Module } from '@nestjs/common';
import * as Joi from 'joi';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import prismaConfig from './config/prisma.config';
import evmConfig from './config/evm.config';
import openaiConfig from './config/openai.config';

// Modules
import { PrismaModule } from './infra/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AiModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, prismaConfig, evmConfig, openaiConfig],
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(16).required(),
        EVM_RPC_URL: Joi.string().uri().default('https://sepolia.base.org'),
        EVM_CHAIN_ID: Joi.number().default(84532),
        EVM_MERCHANT_ADDRESS: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
        EVM_USDC_ADDRESS: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
        EVM_ROUTER_ADDRESS: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
        OPENAI_API_KEY: Joi.string().required(),
        OPENAI_MODEL: Joi.string().default('gpt-4o-mini'),
        PORT: Joi.number().default(3001),
        CORS_ORIGIN: Joi.string().required(),
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    InvoicesModule,
    PaymentsModule,
    AiModule,
    NotificationsModule,
  ],
  providers: [],
})
export class AppModule {}