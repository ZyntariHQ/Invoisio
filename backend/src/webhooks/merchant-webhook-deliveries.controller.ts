import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { MerchantRole } from "../common/enums/merchant-role.enum";
import { MerchantRolesGuard } from "../common/guards/merchant-roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { User } from "../users/user.entity";
import {
  MerchantDeadLetterQueryDto,
  MerchantDeliveryHistoryQueryDto,
} from "./dto/merchant-delivery-history.dto";
import { WebhooksService } from "./webhooks.service";

/**
 * Merchant-facing webhook delivery history endpoints.
 *
 * All routes are scoped to the authenticated user's merchant — a merchant
 * can only ever see and act on their own deliveries.  No cross-merchant data
 * leakage is possible because:
 *
 *  1. `WebhookDelivery` rows are filtered via `invoice.merchantId`.
 *  2. `WebhookDeadLetter` rows carry a top-level `merchantId` column and are
 *     filtered directly on that column.
 *  3. The retry endpoint re-verifies ownership inside `retryMerchantDeadLetter`
 *     before touching the dead-letter row, so even a forged `id` from a
 *     different merchant returns 404 — not 403 — to avoid oracle attacks.
 */
@Controller("webhooks/deliveries")
export class MerchantWebhookDeliveriesController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /webhooks/deliveries
   *
   * Returns paginated webhook delivery history for the authenticated
   * merchant.  Supports cursor-based pagination via `?cursor=<lastId>` and
   * `?limit=<n>` (1–100, default 50).
   *
   * Accessible by all authenticated merchant members.
   */
  @Auth()
  @Get()
  async listDeliveries(
    @CurrentUser() user: User,
    @Query() query: MerchantDeliveryHistoryQueryDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.listMerchantDeliveries(user.merchantId, query),
    );
  }

  /**
   * GET /webhooks/deliveries/dead-letters
   *
   * Returns failed / dead-letter deliveries scoped to the authenticated
   * merchant.  Optional `?status=` filter accepts `pending_retry`, `requeued`,
   * or `recovered`.
   *
   * Accessible by all authenticated merchant members.
   */
  @Auth()
  @Get("dead-letters")
  async listDeadLetters(
    @CurrentUser() user: User,
    @Query() query: MerchantDeadLetterQueryDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.listMerchantDeadLetters(user.merchantId, query),
    );
  }

  /**
   * POST /webhooks/deliveries/dead-letters/:id/retry
   *
   * Re-enqueues a dead-letter delivery for re-dispatch.  The service layer
   * enforces that the dead-letter belongs to the requesting merchant;
   * cross-merchant retry attempts receive a 404.
   *
   * Restricted to merchant OWNERs and ADMINs (operators and viewers cannot
   * trigger side-effects on the delivery system).
   */
  @Roles(MerchantRole.OWNER, MerchantRole.ADMIN)
  @UseGuards(MerchantRolesGuard)
  @Post("dead-letters/:id/retry")
  @HttpCode(HttpStatus.OK)
  async retryDeadLetter(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.webhooksService.retryMerchantDeadLetter(id, user.merchantId),
    );
  }
}
