import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const throttlerConfig = configService.get("throttler");

        return {
          throttlers: [
            {
              ttl: throttlerConfig.ttl * 1000,
              limit: throttlerConfig.limit,
            },
          ],
          // Use default in-memory storage instead of Redis
        };
      },
    }),
  ],
  providers: [],
  exports: [],
})
export class CustomThrottlerModule {}
