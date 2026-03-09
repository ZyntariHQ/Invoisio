import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { ThrottlerStorageRedisService } from "./throttler-storage-redis.service";

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const throttlerConfig = configService.get("throttler");
        
        // Create Redis client
        const redis = new Redis({
          host: throttlerConfig.redis.host,
          port: throttlerConfig.redis.port,
          password: throttlerConfig.redis.password,
          db: throttlerConfig.redis.db,
          keyPrefix: throttlerConfig.redis.keyPrefix,
          maxRetriesPerRequest: null,
        });

        const storage = new ThrottlerStorageRedisService(redis);

        return {
          throttlers: [
            {
              ttl: throttlerConfig.ttl * 1000, // Convert to milliseconds
              limit: throttlerConfig.limit,
            },
          ],
          storage: storage,
        };
      },
    }),
  ],
  providers: [ThrottlerStorageRedisService],
  exports: [ThrottlerStorageRedisService],
})
export class CustomThrottlerModule {}
