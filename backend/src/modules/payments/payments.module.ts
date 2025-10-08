import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { StarknetModule } from '../../infra/starknet/starknet.module';

@Module({
  imports: [PrismaModule, StarknetModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}