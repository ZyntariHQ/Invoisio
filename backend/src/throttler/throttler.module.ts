import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerStorageRedisService } from "./throttler-storage-redis.service";

const providers =
  process.env.NODE_ENV === "test" ? [] : [ThrottlerStorageRedisService];

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const throttlerConfig = configService.get("throttler");

        // Skip Redis configuration in test environment
        if (process.env.NODE_ENV === "test") {
          return {
            throttlers: [
              {
                ttl: throttlerConfig.ttl * 1000,
                limit: throttlerConfig.limit,
              },
            ],
          };
        }

        // Dynamic import for Redis to avoid lint issues
        const { Redis } = await import("ioredis");

        // Create Redis client for non-test environments
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
              ttl: throttlerConfig.ttl * 1000,
              limit: throttlerConfig.limit,
            },
          ],
          storage: storage,
        };
      },
    }),
  ],
  providers,
  exports: providers,
})
export class CustomThrottlerModule {}
