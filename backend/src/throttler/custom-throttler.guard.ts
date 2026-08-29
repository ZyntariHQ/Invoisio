import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerException } from "@nestjs/throttler";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user) {
      if (req.user.merchantId) {
        return `merchant:${req.user.merchantId}`;
      }
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: {
      limit: number;
      ttl: number;
      key: string;
      tracker: string;
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
    },
  ): Promise<void> {
    const res = context.switchToHttp().getResponse();
    res.header(
      "Retry-After",
      Math.ceil(throttlerLimitDetail.timeToBlockExpire / 1000) || 1,
    );
    res.header("X-RateLimit-Limit", throttlerLimitDetail.limit);
    res.header(
      "X-RateLimit-Remaining",
      Math.max(0, throttlerLimitDetail.limit - throttlerLimitDetail.totalHits),
    );
    res.header(
      "X-RateLimit-Reset",
      Math.ceil(throttlerLimitDetail.timeToExpire / 1000),
    );
    throw new ThrottlerException("Too Many Requests");
  }
}
