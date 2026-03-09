import { Injectable } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { Redis } from "ioredis";

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      // Set expiration only on first increment
      await this.redis.expire(key, Math.ceil(ttl / 1000));
    }

    const timeToExpire = await this.redis.pttl(key);
    const isBlocked = current > limit;
    
    return {
      totalHits: current,
      timeToExpire: timeToExpire > 0 ? timeToExpire : ttl,
      isBlocked,
      timeToBlockExpire: isBlocked ? blockDuration : 0,
    };
  }
}
