import { Module } from "@nestjs/common";
import { ActivityFeedController } from "./activity-feed.controller";
import { ActivityFeedService } from "./activity-feed.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ActivityFeedController],
  providers: [ActivityFeedService],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}