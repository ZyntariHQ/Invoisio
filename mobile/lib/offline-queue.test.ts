import { OfflineQueueManager, QueuedRequest } from "./offline-queue";

describe("OfflineQueueManager", () => {
  let mockStorage: Record<string, string> = {};
  const fakeAsyncStorage: any = {
    getItem: async (key: string) => mockStorage[key] ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: async (key: string) => {
      delete mockStorage[key];
    },
  };

  beforeEach(() => {
    mockStorage = {};
  });

  test("enqueues and stores request descriptors without window dependencies", async () => {
    const manager = new OfflineQueueManager(fakeAsyncStorage);

    const id = await manager.enqueue(
      "https://api.invoisio.com/v1/invoices",
      "POST",
      { customerId: "cust_123", amount: 500 },
      { "X-Client": "Mobile-RN" },
      "create-invoice"
    );

    expect(id).toBeDefined();
    expect(manager.getQueueSize()).toBe(1);

    const queue = manager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!).toMatchObject({
      id,
      url: "https://api.invoisio.com/v1/invoices",
      method: "POST",
      data: { customerId: "cust_123", amount: 500 },
      headers: { "X-Client": "Mobile-RN" },
      descriptorTag: "create-invoice",
      retryCount: 0,
    });
  });

  test("rejects invalid or empty URLs", async () => {
    const manager = new OfflineQueueManager(fakeAsyncStorage);
    await expect(manager.enqueue("", "POST")).rejects.toThrow("valid non-empty string");
  });

  test("replays queued requests on processQueue with dynamic auth token", async () => {
    const manager = new OfflineQueueManager(fakeAsyncStorage);

    await manager.enqueue(
      "https://api.invoisio.com/v1/payments",
      "POST",
      { invoiceId: "inv_99" },
      { "Content-Type": "application/json" }
    );

    const processedRequests: QueuedRequest[] = [];
    const originalFetch = global.fetch;

    global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string> | undefined) ?? {};
      expect(headers["Authorization"]).toBe("Bearer fresh_jwt_token_123");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, id: "pay_1" }),
      } as any;
    };

    try {
      await manager.processQueue({
        getAuthToken: () => "fresh_jwt_token_123",
        onSuccess: (req) => processedRequests.push(req),
      });

      expect(processedRequests).toHaveLength(1);
      expect(manager.getQueueSize()).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("records actionable debugging error metadata on replay failure", async () => {
    const manager = new OfflineQueueManager(fakeAsyncStorage);

    await manager.enqueue(
      "https://api.invoisio.com/v1/invoices/inv_1",
      "PATCH",
      { status: "paid" }
    );

    const originalFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Database lock",
      } as any;
    };

    try {
      await manager.processQueue();

      const queue = manager.getQueue();
      expect(queue).toHaveLength(1);
      const failedRequest = queue[0]!;
      expect(failedRequest.retryCount).toBe(1);
      expect(failedRequest.lastError).toBeDefined();
      expect(failedRequest.lastError?.status).toBe(500);
      expect(failedRequest.lastError?.message).toContain("HTTP 500");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
