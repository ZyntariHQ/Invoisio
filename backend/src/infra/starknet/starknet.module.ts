import { Module } from '@nestjs/common';
import { StarknetService } from './starknet.service';


@Module({
  providers: [StarknetService],
  exports: [StarknetService],
})
export class StarknetModule {}