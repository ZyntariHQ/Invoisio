import { ThrottlerStorageRedisService } from "./throttler-storage-redis.service";

/**
 * Unit tests for ThrottlerStorageRedisService
 *
 * Tests the Redis-backed rate-limit storage:
 * - Normal increment behavior
 * - Block key creation when limit exceeded
 * - Block key respected during block period
 * - Block key expiry allowing new requests
 * - PTTL edge case handling (-2 key missing, -1 no expiry)
 */
describe("ThrottlerStorageRedisService", () => {
  let service: ThrottlerStorageRedisService;
  let redis: Record<string, any>;

  beforeEach(() => {
    // In-memory Redis mock that simulates incr, expire, pttl, psetex, del
    const store = new Map<
      string,
      { value: number; ttl: number; pttl: number }
    >();

    redis = {
      incr: jest.fn(async (key: string) => {
        const entry = store.get(key) || { value: 0, ttl: 0, pttl: 0 };
        entry.value += 1;
        store.set(key, entry);
        return entry.value;
      }),
      expire: jest.fn(async (key: string, ttl: number) => {
        // record TTL (seconds -> ms) so subsequent pttl reads are consistent
        const entry = store.get(key);
        if (entry) entry.pttl = ttl * 1000;
      }),
      pexpire: jest.fn(async (key: string, ttl: number) => {
        const entry = store.get(key);
        if (entry) entry.pttl = ttl;
      }),
      pttl: jest.fn(async (key: string) => {
        const entry = store.get(key);
        if (!entry) return -2; // key does not exist
        if (entry.pttl === -1) return -1; // no expiry
        return entry.pttl;
      }),
      psetex: jest.fn(async (key: string, pttl: number, _value: string) => {
        store.set(key, { value: 1, ttl: 0, pttl });
      }),
      set: jest.fn(
        async (key: string, _value: string, _mode?: string, ttl?: number) => {
          const entry = store.get(key) || { value: 0, ttl: 0, pttl: 0 };
          entry.value = 1;
          if (typeof ttl === "number") entry.pttl = ttl;
          store.set(key, entry);
        },
      ),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      _store: store,
    };

    service = new ThrottlerStorageRedisService(redis);
  });

  describe("increment", () => {
    it("returns totalHits of 1 on first request", async () => {
      const result = await service.increment("key1", 60_000, 5, 0, "default");
      expect(result.totalHits).toBe(1);
      expect(result.isBlocked).toBe(false);
    });

    it("increments totalHits on subsequent requests", async () => {
      await service.increment("key1", 60_000, 5, 0, "default");
      await service.increment("key1", 60_000, 5, 0, "default");
      const result = await service.increment("key1", 60_000, 5, 0, "default");
      expect(result.totalHits).toBe(3);
      expect(result.isBlocked).toBe(false);
    });

    it("sets expire on first increment only", async () => {
      await service.increment("key1", 60_000, 5, 0, "default");
      await service.increment("key1", 60_000, 5, 0, "default");
      // expire is called on first increment only
      expect(redis.expire).toHaveBeenCalledTimes(1);
    });

    it("returns isBlocked=true when limit exceeded", async () => {
      // limit is 2, so 3rd request should be blocked
      await service.increment("key1", 60_000, 2, 0, "default");
      await service.increment("key1", 60_000, 2, 0, "default");
      const result = await service.increment("key1", 60_000, 2, 0, "default");
      expect(result.totalHits).toBe(3);
      expect(result.isBlocked).toBe(true);
    });

    it("returns isBlocked=false when at limit (not over)", async () => {
      await service.increment("key1", 60_000, 2, 0, "default");
      const result = await service.increment("key1", 60_000, 2, 0, "default");
      expect(result.totalHits).toBe(2);
      expect(result.isBlocked).toBe(false);
    });
  });

  describe("block duration", () => {
    it("creates block key when limit exceeded and blockDuration > 0", async () => {
      await service.increment("key1", 60_000, 2, 30_000, "default");
      await service.increment("key1", 60_000, 2, 30_000, "default");
      const result = await service.increment(
        "key1",
        60_000,
        2,
        30_000,
        "default",
      );
      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(30_000);
      expect(redis.psetex).toHaveBeenCalledWith("key1:block", 30_000, "1");
    });

    it("does not create block key when blockDuration is 0", async () => {
      await service.increment("key1", 60_000, 2, 0, "default");
      await service.increment("key1", 60_000, 2, 0, "default");
      const result = await service.increment("key1", 60_000, 2, 0, "default");
      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(0);
      expect(redis.psetex).not.toHaveBeenCalled();
    });

    it("returns blocked state when block key exists with remaining TTL", async () => {
      // Manually set a block key with remaining TTL
      redis._store.set("key1:block", { value: 1, ttl: 0, pttl: 15_000 });

      const result = await service.increment(
        "key1",
        60_000,
        5,
        30_000,
        "default",
      );
      expect(result.isBlocked).toBe(true);
      expect(result.timeToBlockExpire).toBe(15_000);
      expect(result.totalHits).toBe(6); // limit + 1
      // Should not increment the counter while blocked
      expect(redis.incr).not.toHaveBeenCalled();
    });

    it("deletes stale block key when pttl returns 0 (expired)", async () => {
      // Simulate expired block key (pttl returns 0)
      redis._store.set("key1:block", { value: 1, ttl: 0, pttl: 0 });

      const result = await service.increment(
        "key1",
        60_000,
        5,
        30_000,
        "default",
      );
      expect(redis.del).toHaveBeenCalledWith("key1:block");
      expect(result.isBlocked).toBe(false);
    });

    it("deletes stale block key when pttl returns -1 (no expiry)", async () => {
      // Simulate block key with no expiry (pttl returns -1)
      redis._store.set("key1:block", { value: 1, ttl: 0, pttl: -1 });

      const result = await service.increment(
        "key1",
        60_000,
        5,
        30_000,
        "default",
      );
      expect(redis.del).toHaveBeenCalledWith("key1:block");
      expect(result.isBlocked).toBe(false);
    });
  });

  describe("pttl edge cases", () => {
    it("handles pttl -2 (key missing) by using fallback TTL", async () => {
      const result = await service.increment("key1", 60_000, 100, 0, "default");
      // pttl returns -2 for missing key, so timeToExpire should fallback to ttl
      expect(result.timeToExpire).toBe(60_000);
    });

    it("handles pttl -1 (no expiry) by using fallback TTL", async () => {
      // Simulate a key with no expiry
      redis._store.set("key1", { value: 5, ttl: 0, pttl: -1 });

      const result = await service.increment("key1", 60_000, 100, 0, "default");
      // pttl returns -1, so timeToExpire should fallback to ttl
      expect(result.timeToExpire).toBe(60_000);
    });

    it("uses actual pttl when positive", async () => {
      // Simulate a key with 30s remaining
      redis._store.set("key1", { value: 5, ttl: 0, pttl: 30_000 });

      const result = await service.increment("key1", 60_000, 100, 0, "default");
      expect(result.timeToExpire).toBe(30_000);
    });
  });

  describe("isolated keys", () => {
    it("maintains separate counters for different keys", async () => {
      await service.increment("key-a", 60_000, 2, 0, "default");
      await service.increment("key-a", 60_000, 2, 0, "default");
      const resultA = await service.increment("key-a", 60_000, 2, 0, "default");

      await service.increment("key-b", 60_000, 2, 0, "default");
      const resultB = await service.increment("key-b", 60_000, 2, 0, "default");

      expect(resultA.totalHits).toBe(3);
      expect(resultA.isBlocked).toBe(true);
      expect(resultB.totalHits).toBe(2);
      expect(resultB.isBlocked).toBe(false);
    });
  });
});
