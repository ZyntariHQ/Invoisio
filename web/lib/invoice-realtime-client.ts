/**
 * Realtime invoice stream client.
 *
 * Connects to the backend SSE endpoint (`GET /realtime/invoices`) which is
 * authenticated with a JWT. Native `EventSource` cannot send an
 * `Authorization` header, so the stream is consumed via `fetch()` +
 * `ReadableStream` instead. Reconnects use exponential backoff with jitter
 * and retry immediately when the browser comes back online.
 */

import { API_URL, getApiAccessToken } from './api-client';
import { createSseFrameParser } from './sse-frame-parser';

/** Payload published by the backend `InvoiceEventsService`. */
export interface InvoiceStatusEvent {
  merchantId?: string;
  invoiceId: string;
  status: string;
  at: string;
}

export type InvoiceRealtimeState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'unauthorized'
  | 'closed';

export interface InvoiceRealtimeClientOptions {
  /** Called for every parsed invoice status event. */
  onEvent: (event: InvoiceStatusEvent) => void;
  /** Optional connection state change notifier. */
  onStateChange?: (state: InvoiceRealtimeState) => void;
  /** First reconnect delay in ms (default: 1000). */
  initialRetryDelayMs?: number;
  /** Upper bound for reconnect delays in ms (default: 30000). */
  maxRetryDelayMs?: number;
}

export interface InvoiceRealtimeConnection {
  close: () => void;
  /** Force an immediate reconnect attempt (e.g. after regaining focus). */
  reconnect: () => void;
}

const DEFAULT_INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30000;

/** Connections stable for longer than this reset the backoff counter. */
const STABLE_CONNECTION_RESET_MS = 10000;

export function connectInvoiceRealtime(
  options: InvoiceRealtimeClientOptions,
): InvoiceRealtimeConnection {
  const {
    onEvent,
    onStateChange,
    initialRetryDelayMs = DEFAULT_INITIAL_RETRY_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  } = options;

  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let connectedAt = 0;

  function setState(state: InvoiceRealtimeState): void {
    if (!closed) {
      onStateChange?.(state);
    }
  }

  function clearRetryTimer(): void {
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(): void {
    if (closed || retryTimer != null) return;

    const exponential = Math.min(
      initialRetryDelayMs * 2 ** attempt,
      maxRetryDelayMs,
    );
    // ±20% jitter so many clients don't reconnect in lock-step.
    const jitter = exponential * (0.8 + Math.random() * 0.4);
    const delay = Math.max(250, Math.min(jitter, maxRetryDelayMs));

    setState('reconnecting');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      attempt += 1;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (closed) return;

    const token = getApiAccessToken();
    if (token == null || token.length === 0) {
      // Without a token we can never authenticate; leave reconnection to the
      // caller (the hook retries when a token becomes available).
      setState('idle');
      return;
    }

    clearRetryTimer();
    controller = new AbortController();

    try {
      setState(attempt === 0 ? 'connecting' : 'reconnecting');

      const response = await fetch(`${API_URL}/realtime/invoices`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-store',
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        setState('unauthorized');
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(
          `Realtime stream request failed with status ${response.status}`,
        );
      }

      connectedAt = Date.now();
      setState('open');

      const parser = createSseFrameParser((payload) => {
        try {
          const parsed = JSON.parse(payload) as InvoiceStatusEvent;
          if (
            parsed != null &&
            typeof parsed.invoiceId === 'string' &&
            typeof parsed.status === 'string'
          ) {
            onEvent(parsed);
          }
        } catch {
          // Malformed payload; ignore rather than killing the stream.
        }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.flush();

      // Server closed the stream cleanly — reconnect unless we were stopped.
      if (!closed) {
        markStabilityAndScheduleRetry();
      }
    } catch (err) {
      if (controller?.signal.aborted || closed) {
        return;
      }
      console.warn('[realtime] invoice stream disconnected:', err);
      markStabilityAndScheduleRetry();
    }
  }

  function markStabilityAndScheduleRetry(): void {
    if (connectedAt > 0 && Date.now() - connectedAt >= STABLE_CONNECTION_RESET_MS) {
      attempt = 0;
    }
    connectedAt = 0;
    scheduleRetry();
  }

  const handleOnline = () => {
    if (closed || retryTimer == null) return;
    // Network is back — drop the pending backoff and reconnect right away.
    clearRetryTimer();
    setState('connecting');
    void connect();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  void connect();

  return {
    close() {
      if (closed) return;
      closed = true;
      clearRetryTimer();
      controller?.abort();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      onStateChange?.('closed');
    },
    reconnect() {
      if (closed) return;
      clearRetryTimer();
      controller?.abort();
      void connect();
    },
  };
}
