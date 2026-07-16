import { Controller, Get, Param, Query } from "@nestjs/common";
import { ActivityFeedService } from "./activity-feed.service";
import { ActivityEventDto, PaginatedActivityEvents } from "./dto/activity-event.dto";
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
   * Ordered newest first. Supports optional type filtering.
   */
  @Auth()
  @Get()
  async findAll(
    @CurrentUser() user: User,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("type") type?: string,
  ): Promise<PaginatedActivityEvents> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.activityFeedService.findAll(user.merchantId, p, l, type),
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