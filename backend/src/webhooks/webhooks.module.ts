import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { AdminWebhooksController } from "./admin-webhooks.controller";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WebhooksController, AdminWebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
