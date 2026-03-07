import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [PrismaModule],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
