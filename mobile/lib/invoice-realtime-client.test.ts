import {
  connectInvoiceEvents,
  type InvoiceLiveConnectionState,
  type InvoiceStatusEvent,
} from "./invoice-realtime-client";

class FakeXHR {
  readyState = 0;
  status = 0;
  responseText = "";
  aborted = false;
  requestHeaders: Record<string, string> = {};

  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(_method: string, _url: string): void {
    this.readyState = 1;
  }

  setRequestHeader(key: string, value: string): void {
    this.requestHeaders[key] = value;
  }

  send(): void {
    // no-op: the test drives the fake stream via emit* helpers below
  }

  abort(): void {
    this.aborted = true;
    this.readyState = 4;
    this.status = 0;
    this.onreadystatechange?.();
  }

  emitHeaders(status: number): void {
    this.readyState = 2;
    this.status = status;
    this.onreadystatechange?.();
  }

  emitChunk(text: string): void {
    this.readyState = 3;
    this.responseText += text;
    this.onprogress?.();
  }

  emitError(): void {
    this.onerror?.();
  }

  emitStreamClosed(): void {
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

function setupHarness() {
  const instances: FakeXHR[] = [];
  const createTransport = () => {
    const xhr = new FakeXHR();
    instances.push(xhr);
    return xhr as unknown as XMLHttpRequest;
  };
  const events: InvoiceStatusEvent[] = [];
  const states: InvoiceLiveConnectionState[] = [];

  const disconnect = connectInvoiceEvents({
    token: "test-token",
    createTransport,
    onEvent: (e) => events.push(e),
    onStateChange: (s) => states.push(s),
  });

  return { instances, events, states, disconnect };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("connectInvoiceEvents", () => {
  it("sends bearer auth and streams parsed events as they arrive", () => {
    const { instances, events, states } = setupHarness();

    expect(instances).toHaveLength(1);
    expect(instances[0]?.requestHeaders["Authorization"]).toBe(
      "Bearer test-token",
    );
    expect(states).toEqual(["connecting"]);

    instances[0]?.emitHeaders(200);
    instances[0]?.emitChunk(
      'data: {"merchantId":"m1","invoiceId":"inv1","status":"paid","at":"2026-08-16T00:00:00Z"}\n\n',
    );

    expect(states).toEqual(["connecting", "open"]);
    expect(events).toEqual([
      {
        merchantId: "m1",
        invoiceId: "inv1",
        status: "paid",
        at: "2026-08-16T00:00:00Z",
      },
    ]);
  });

  it("reconnects with exponential backoff when the stream closes", () => {
    const { instances, states } = setupHarness();

    instances[0]?.emitHeaders(200);
    instances[0]?.emitStreamClosed();
    expect(states).toEqual(["connecting", "reconnecting"]);
    expect(instances).toHaveLength(1);

    jest.advanceTimersByTime(999);
    expect(instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(instances).toHaveLength(2);

    instances[1]?.emitHeaders(200);
    instances[1]?.emitStreamClosed();
    // second retry waits 2000ms (doubled)
    jest.advanceTimersByTime(1999);
    expect(instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });

  it("reconnects after a transport error", () => {
    const { instances, states } = setupHarness();

    instances[0]?.emitError();
    expect(states).toEqual(["connecting", "reconnecting"]);

    jest.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
  });

  it("resets backoff to the base delay after a successful reconnect", () => {
    const { instances } = setupHarness();

    instances[0]?.emitError();
    jest.advanceTimersByTime(1000); // first reconnect after 1s
    expect(instances).toHaveLength(2);

    instances[1]?.emitHeaders(200);
    instances[1]?.emitChunk(
      'data: {"merchantId":"m1","invoiceId":"i","status":"paid","at":"t"}\n\n',
    );
    instances[1]?.emitStreamClosed();

    // backoff should have reset to 1s, not doubled to 2s
    jest.advanceTimersByTime(999);
    expect(instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });

  it("stops permanently on an auth failure without scheduling reconnects", () => {
    const { instances, states } = setupHarness();

    instances[0]?.emitHeaders(401);
    instances[0]?.emitStreamClosed();

    expect(states).toEqual(["connecting", "error"]);

    jest.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it("aborts the in-flight request and stops future reconnects on disconnect", () => {
    const { instances, states, disconnect } = setupHarness();

    instances[0]?.emitHeaders(200);
    disconnect();

    expect(instances[0]?.aborted).toBe(true);
    expect(states[states.length - 1]).toBe("closed");

    jest.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it("cancels a pending reconnect timer if disconnected while waiting", () => {
    const { instances, disconnect } = setupHarness();

    instances[0]?.emitStreamClosed();
    disconnect();

    jest.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it("ignores malformed event payloads instead of throwing", () => {
    const { instances, events } = setupHarness();

    instances[0]?.emitHeaders(200);
    expect(() => {
      instances[0]?.emitChunk("data: not-json\n\n");
    }).not.toThrow();
    expect(events).toEqual([]);
  });
});
