import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    console.log("getTracker called!", req.user, req.ip);
    if (req.user) {
      if (req.user.merchantId) {
        return `merchant:${req.user.merchantId}`;
      }
      return `user:${req.user.id}`;
    }

    // Fallback to IP for unauthenticated routes (auth, engagement)
    return `ip:${req.ip}`;
  }
}
