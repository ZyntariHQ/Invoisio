import { Controller, Get, Param, Query } from "@nestjs/common";
import { ActivityFeedService } from "./activity-feed.service";
import {
  ActivityEventDto,
  ActivityFeedQuery,
  PaginatedActivityEvents,
} from "./dto/activity-event.dto";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";

@Controller("activity-feed")
export class ActivityFeedController {
  constructor(
    private readonly activityFeedService: ActivityFeedService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get paginated activity events for the authenticated merchant.
   * Ordered newest first.
   *
   * Query params:
   * - Offset paging: `page`, `limit`
   * - Cursor paging: `cursor`, `pageSize`, `before`
   * - Filters: `type`, `startDate`, `endDate`, `invoiceId`
   */
  @Auth()
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("pageSize") pageSize?: string,
    @Query("cursor") cursor?: string,
    @Query("before") before?: string,
    @Query("type") type?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("invoiceId") invoiceId?: string,
  ): Promise<PaginatedActivityEvents> {
    const query: ActivityFeedQuery = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      cursor,
      before: before === "true" || before === "1",
      type,
      startDate,
      endDate,
      invoiceId,
    };
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.activityFeedService.findAll(user.merchantId, query),
    );
  }

  /**
   * Get a single activity event by ID.
   */
  @Auth()
  @Get(":id")
  async findOne(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ActivityEventDto | null> {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.activityFeedService.findOne(id, user.merchantId),
    );
  }
}
