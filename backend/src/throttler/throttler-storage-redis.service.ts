import { Injectable } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(private readonly redis: any) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const blockKey = `${key}:block`;

    // Check if the request is currently blocked
    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      // Still within block period — do not increment, just report blocked state
      return {
        totalHits: limit + 1,
        timeToExpire: await this.getTimeToExpire(key, ttl),
        isBlocked: true,
        timeToBlockExpire: blockTtl,
      };
    }
    // Block key expired or missing — remove stale block key if it exists
    if (blockTtl === -2) {
      // Key doesn't exist, nothing to clean
    } else {
      // pttl returned -1 (no expiry) or 0 (expired) — delete the stale key
      await this.redis.del(blockKey);
    }

    // Increment the hit counter
    const current = await this.redis.incr(key);

    // Set expiration only on first increment
    if (current === 1) {
      await this.redis.expire(key, Math.ceil(ttl / 1000));
    }

    const timeToExpire = await this.getTimeToExpire(key, ttl);
    const isBlocked = current > limit;

    // Activate block duration if limit exceeded and blockDuration is configured
    if (isBlocked && blockDuration > 0) {
      // Set block key with millisecond precision; only set if not already blocked
      const existingBlockTtl = await this.redis.pttl(blockKey);
      if (existingBlockTtl <= 0) {
        await this.redis.psetex(blockKey, blockDuration, "1");
      }
      return {
        totalHits: current,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: blockDuration,
      };
    }

    return {
      totalHits: current,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: 0,
    };
  }

  /**
   * Get time-to-expire for the counter key, handling pttl edge cases.
   * pttl returns: -2 (key missing), -1 (no expiry), >0 (ms remaining)
   */
  private async getTimeToExpire(
    key: string,
    fallbackTtl: number,
  ): Promise<number> {
    const pttl = await this.redis.pttl(key);
    if (pttl > 0) {
      return pttl;
    }
    // pttl -2 (key missing) or -1 (no expiry) — use configured ttl
    return fallbackTtl;
  }
}
