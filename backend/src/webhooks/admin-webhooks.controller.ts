import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/guard/admin.guard";
import { WebhooksService } from "./webhooks.service";
import { ListDeadLettersDto } from "./dto/list-dead-letters.dto";

@Controller("admin/webhooks")
@UseGuards(AdminGuard)
export class AdminWebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get("dead-letter")
  async listDeadLetters(@Query() query: ListDeadLettersDto) {
    return this.webhooksService.listDeadLetters(query);
  }

  @Get("dead-letter/:id")
  async getDeadLetter(@Param("id") id: string) {
    return this.webhooksService.getDeadLetter(id);
  }

  @Post("dead-letter/:id/retry")
  async retryDeadLetter(@Param("id") id: string) {
    return this.webhooksService.retryDeadLetter(id);
  }
}
