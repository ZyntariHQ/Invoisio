import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StarknetService {
  constructor(private configService: ConfigService) {}

  // Add Starknet interaction methods here
}