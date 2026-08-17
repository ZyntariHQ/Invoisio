import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";
import {
  WebhooksService,
  WebhookSecretMetadata,
  WebhookSecretRotationResult,
} from "./webhooks.service";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";
import { WebhookTestDeliveryResultDto } from "./dto/webhook-test-delivery.dto";

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
   * Generate and persist a new webhook secret for the current merchant.
   *
   * The raw secret is returned once so the caller can copy it into their
   * signing configuration. Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Post("secret/rotate")
  @HttpCode(HttpStatus.OK)
  async rotateSecret(
    @CurrentUser() user: User,
  ): Promise<WebhookSecretRotationResult> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.rotateWebhookSecret(user.id, user.merchantId),
    );
  }

  /**
   * Send a signed test webhook delivery to the merchant's configured endpoint.
   *
   * Sends a sample payload signed with the active webhook secret so merchants
   * can verify their endpoint is reachable and correctly processes HMAC
   * signatures before real production traffic arrives.
   *
   * Test deliveries are fully isolated – they are never written to the
   * delivery history or dead-letter queue, and the payload is clearly
   * labelled `"event": "test"` so it cannot be confused with a real event.
   *
   * Restricted to merchant OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Post("test")
  @HttpCode(HttpStatus.OK)
  async sendTestDelivery(
    @CurrentUser() user: User,
  ): Promise<WebhookTestDeliveryResultDto> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.sendTestDelivery(user.id, user.merchantId),
    );
  }
}
