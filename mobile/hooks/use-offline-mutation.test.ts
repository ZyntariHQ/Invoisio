import { offlineQueue } from "../lib/offline-queue";

describe("useOfflineMutation React Native Descriptor Logic", () => {
  beforeEach(async () => {
    await offlineQueue.clearQueue();
  });

  test("enqueues mutation using static descriptor URL and method", async () => {
    const descriptor = {
      url: "https://api.invoisio.com/v1/invoices",
      method: "POST" as const,
      headers: { "X-App": "InvoisioMobile" },
      tag: "invoice-create",
    };

    const variables = { title: "Web Design", amount: 1500 };
    const queueId = await offlineQueue.enqueue(
      descriptor.url,
      descriptor.method,
      variables,
      descriptor.headers,
      descriptor.tag
    );

    expect(queueId).toBeDefined();
    const queued = offlineQueue.getQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe("https://api.invoisio.com/v1/invoices");
    expect(queued[0].method).toBe("POST");
    expect(queued[0].data).toEqual({ title: "Web Design", amount: 1500 });
    expect(queued[0].headers).toEqual({ "X-App": "InvoisioMobile" });
    expect(queued[0].descriptorTag).toBe("invoice-create");
  });

  test("resolves dynamic URL and dynamic headers from variables", async () => {
    const descriptor = {
      url: (vars: { invoiceId: string }) => `https://api.invoisio.com/v1/invoices/${vars.invoiceId}/void`,
      method: "POST" as const,
      headers: (vars: { invoiceId: string }) => ({
        "X-Target-Resource": vars.invoiceId,
      }),
      tag: "invoice-void",
    };

    const vars = { invoiceId: "inv_456" };
    const resolvedUrl = descriptor.url(vars);
    const resolvedHeaders = descriptor.headers(vars);

    const queueId = await offlineQueue.enqueue(
      resolvedUrl,
      descriptor.method,
      vars,
      resolvedHeaders,
      descriptor.tag
    );

    expect(queueId).toBeDefined();
    const queued = offlineQueue.getQueue();
    expect(queued[0].url).toBe("https://api.invoisio.com/v1/invoices/inv_456/void");
    expect(queued[0].headers).toEqual({ "X-Target-Resource": "inv_456" });
  });
});
