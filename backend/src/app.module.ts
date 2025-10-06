import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from './common/pipes/validation.pipe';
import appConfig from './config/app.config';
import prismaConfig from './config/prisma.config';
import starknetConfig from './config/starknet.config';
import openaiConfig from './config/openai.config';

// Modules
import { PrismaModule } from './infra/prisma/prisma.module';
import { StarknetModule } from './infra/starknet/starknet.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, prismaConfig, starknetConfig, openaiConfig],
    }),
    PrismaModule,
    StarknetModule,
    HealthModule,
    AuthModule,
    InvoicesModule,
    PaymentsModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}