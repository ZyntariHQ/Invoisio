import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { EvmWatcherService } from './evm-watcher.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../infra/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, EvmWatcherService],
})
export class PaymentsModule {}