import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
   * Fire a synthetic test payload to the merchant's configured webhook URL.
   * Not persisted – connectivity probe only. Restricted to OWNERs and ADMINs.
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Post("test-send")
  @HttpCode(HttpStatus.OK)
  async testSend(
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; httpStatus: number | null; error: string | null }> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.sendTestWebhook(user.id, user.merchantId),
    );
  }

  /**
   * Return recent delivery history and dead-letters for the current merchant.
   * Accepts optional `limit` query param (1-100, default 20).
   */
  @Auth()
  @Get("deliveries")
  async getDeliveries(
    @CurrentUser() user: User,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.getRecentDeliveries(
        user.id,
        user.merchantId,
        isNaN(parsedLimit) ? 20 : parsedLimit,
      ),
    );
  }
}
