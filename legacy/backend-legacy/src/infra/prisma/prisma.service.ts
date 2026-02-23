import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection successful');
    } catch (error) {
      this.logger.error('Database connection failed:', error.message);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Running in development mode without database connection');
      } else {
        throw error;
      }
    }
  }
}