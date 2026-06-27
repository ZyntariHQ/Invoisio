import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
