import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerStorageRedisService } from "./throttler-storage-redis.service";

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
            getTracker: (req: Record<string, any>) => {
              if (req.user?.id) {
                return `user:${req.user.id}`;
              }
              return req.ip;
            },
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
          getTracker: (req: Record<string, any>) => {
            if (req.user?.id) {
              return `user:${req.user.id}`;
            }
            return req.ip;
          },
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class CustomThrottlerModule {}
