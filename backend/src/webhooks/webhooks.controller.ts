import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";
import {
  WebhooksService,
  InvoiceWebhookAttemptsQuery,
  WebhookSecretMetadata,
  WebhookSecretRotationResult,
} from "./webhooks.service";
import { ListInvoiceWebhookAttemptsDto } from "./dto/list-invoice-webhook-attempts.dto";

@Controller("webhooks")
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Read masked metadata for the current merchant's webhook secret.
   */
  @Auth()
  @Get("secret")
  async getSecretMetadata(
    @CurrentUser() user: User,
  ): Promise<WebhookSecretMetadata> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.getWebhookSecretMetadata(user.id, user.merchantId),
    );
  }

  /**
   * Read outbound webhook attempt history for a merchant-owned invoice.
   */
  @Auth()
  @Get("invoices/:invoiceId/attempts")
  async listInvoiceAttempts(
    @CurrentUser() user: User,
    @Param("invoiceId") invoiceId: string,
    @Query() query: ListInvoiceWebhookAttemptsDto,
  ) {
    const attemptQuery: InvoiceWebhookAttemptsQuery = {
      limit: query.limit,
    };

    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.listInvoiceWebhookAttempts(
        invoiceId,
        user.merchantId,
        attemptQuery,
      ),
    );
  }

  /**
   * Generate and persist a new webhook secret for the current merchant.
   *
   * The raw secret is returned once so the caller can copy it into their
   * signing configuration.
   */
  @Auth()
  @Post("secret/rotate")
  @HttpCode(HttpStatus.OK)
  async rotateSecret(
    @CurrentUser() user: User,
  ): Promise<WebhookSecretRotationResult> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.rotateWebhookSecret(user.id, user.merchantId),
    );
  }
}
