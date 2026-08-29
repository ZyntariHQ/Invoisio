import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerStorageRedisService } from "./throttler-storage-redis.service";

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const throttlerConfig = configService.get("throttler");

        // The global ThrottlerGuard runs BEFORE the route-level JwtAuthGuard,
        // so req.user is not populated yet when we compute the throttle key.
        // Derive the caller's identity from the bearer token directly so that
        // authenticated routes are throttled per-user/per-merchant (AC4)
        // instead of collapsing every logged-in user behind the same client IP.
        // Unauthenticated routes (no bearer token) still key by real client IP,
        // preserving AC3. Verification failures fall back to IP rather than 401,
        // because rate-limit keying must never reject a request on its own.
        const jwtService = new JwtService({
          secret: configService.get<string>("JWT_SECRET"),
        });

        const getTracker = async (
          req: Record<string, any>,
        ): Promise<string> => {
          const user = req.user;
          if (user?.merchantId) return `merchant:${user.merchantId}`;
          if (user?.id) return `user:${user.id}`;

          const auth = req.headers?.authorization;
          if (typeof auth === "string" && auth.startsWith("Bearer ")) {
            try {
              const payload = jwtService.verify<{
                sub?: string;
                merchantId?: string;
              }>(auth.slice("Bearer ".length));
              if (payload?.merchantId) return `merchant:${payload.merchantId}`;
              if (payload?.sub) return `user:${payload.sub}`;
            } catch {
              // Invalid/expired token — fall back to IP below
            }
          }
          return req.ip;
        };

        // Skip Redis configuration in test environment
        if (process.env.NODE_ENV === "test") {
          return {
            throttlers: [
              {
                ttl: throttlerConfig.ttl * 1000,
                limit: throttlerConfig.limit,
              },
            ],
            getTracker,
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
          getTracker,
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class CustomThrottlerModule {}
