import { Module } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";

/**
 * Webhooks module — provides WebhooksService to other modules.
 */
@Module({
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
