import { API_URL } from "@env";
import { nextReconnectDelayMs, parseSseBuffer } from "./sse-parser";

export interface InvoiceStatusEvent {
  merchantId: string;
  invoiceId: string;
  status: string;
  at: string;
}

export type InvoiceLiveConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface ConnectInvoiceEventsOptions {
  token: string;
  onEvent: (event: InvoiceStatusEvent) => void;
  onStateChange: (state: InvoiceLiveConnectionState) => void;
  url?: string;
  createTransport?: () => XMLHttpRequest;
}

export type Disconnect = () => void;

/**
 * Opens the backend's `/realtime/invoices` SSE stream using XHR instead of
 * the (unavailable on React Native) `EventSource` API: RN's XHR polyfill
 * fires `progress` events with the response body accumulated so far, which
 * lets us read a growing text/event-stream response incrementally while
 * still sending a custom Authorization header (something EventSource can't
 * do). Reconnects automatically with exponential backoff unless the stream
 * closes because of an auth failure.
 */
export function connectInvoiceEvents(
  options: ConnectInvoiceEventsOptions,
): Disconnect {
  const {
    token,
    onEvent,
    onStateChange,
    url = `${API_URL}/realtime/invoices`,
    createTransport = () => new XMLHttpRequest(),
  } = options;

  let stopped = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequest: XMLHttpRequest | null = null;

  const scheduleReconnect = () => {
    if (stopped) return;
    onStateChange("reconnecting");
    const delay = nextReconnectDelayMs(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(open, delay);
  };

  function open() {
    if (stopped) return;
    onStateChange(attempt === 0 ? "connecting" : "reconnecting");

    let processedLength = 0;
    let buffer = "";
    let authFailed = false;

    const req = createTransport();
    activeRequest = req;

    req.onreadystatechange = () => {
      if (req.readyState === 2 && (req.status === 401 || req.status === 403)) {
        authFailed = true;
      }
      if (req.readyState === 4) {
        activeRequest = null;
        if (stopped) return;
        if (authFailed) {
          stopped = true;
          onStateChange("error");
          return;
        }
        scheduleReconnect();
      }
    };

    req.onprogress = () => {
      if (stopped || authFailed) return;
      attempt = 0;
      onStateChange("open");

      const text = req.responseText;
      const chunk = text.slice(processedLength);
      processedLength = text.length;
      buffer += chunk;

      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;

      for (const evt of events) {
        if (evt.event && evt.event !== "message") continue;
        try {
          onEvent(JSON.parse(evt.data) as InvoiceStatusEvent);
        } catch {
          // Malformed frame — drop it, the stream will self-heal on the
          // next well-formed event.
        }
      }
    };

    req.onerror = () => {
      if (stopped) return;
      activeRequest = null;
      scheduleReconnect();
    };

    req.open("GET", url, true);
    req.setRequestHeader("Authorization", `Bearer ${token}`);
    req.setRequestHeader("Accept", "text/event-stream");
    req.send();
  }

  open();

  return () => {
    stopped = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (activeRequest !== null) activeRequest.abort();
    onStateChange("closed");
  };
}
