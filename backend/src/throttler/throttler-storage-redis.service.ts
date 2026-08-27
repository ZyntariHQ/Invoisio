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

    let timeToBlockExpire = await this.redis.pttl(blockKey);

    if (timeToBlockExpire > 0) {
      const timeToExpire = await this.redis.pttl(key);
      return {
        totalHits: limit + 1,
        timeToExpire: timeToExpire > 0 ? timeToExpire : ttl,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    const current = await this.redis.incr(key);
    let timeToExpire = await this.redis.pttl(key);

    // pttl fallback: if -1 (no expire) or -2 (does not exist)
    if (current === 1 || timeToExpire <= 0) {
      await this.redis.pexpire(key, ttl);
      timeToExpire = ttl;
    }

    const isBlocked = current > limit;
    timeToBlockExpire = 0;

    if (isBlocked) {
      const blockTtl = blockDuration || ttl;
      await this.redis.set(blockKey, "1", "PX", blockTtl);
      timeToBlockExpire = blockTtl;
    }

    return {
      totalHits: current,
      timeToExpire: timeToExpire > 0 ? timeToExpire : ttl,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
