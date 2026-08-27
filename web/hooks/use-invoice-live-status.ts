'use client';

/**
 * Invoice status hook driven by the backend realtime SSE stream.
 *
 * Replaces interval polling in the high-value payment views:
 * - While the realtime stream is open, status transitions arrive instantly
 *   and no polling requests are made.
 * - When the stream is unavailable (connecting, degraded connectivity,
 *   unauthorized), the hook falls back to interval polling with exponential
 *   backoff so updates keep flowing.
 * - Status transitions trigger an optimistic local update plus an
 *   authoritative refetch (so details like `tx_hash` stay accurate).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectInvoiceRealtime,
  type InvoiceRealtimeConnection,
  type InvoiceRealtimeState,
  type InvoiceStatusEvent,
} from '@/lib/invoice-realtime-client';

export interface InvoiceLiveStatusConfig {
  /** Fallback polling interval in ms while realtime is down (default: 2000). */
  fallbackInterval?: number;
  /** Maximum fallback polling interval in ms (default: 30000). */
  maxInterval?: number;
  /** Exponential backoff multiplier for fallback polls (default: 1.5). */
  backoffMultiplier?: number;
  /** Stop live tracking once the invoice reaches a terminal status (default: true). */
  stopOnTerminal?: boolean;
}

export interface UseInvoiceLiveStatusReturn<Invoice> {
  invoice: Invoice | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshStatus: () => Promise<void>;
  isLive: boolean;
  connectionState: InvoiceRealtimeState;
}

/** Statuses after which no further updates are expected. */
const TERMINAL_STATUSES = new Set(['paid', 'cancelled']);

function isTerminalStatus(status: unknown): boolean {
  return typeof status === 'string' && TERMINAL_STATUSES.has(status);
}

export function useInvoiceLiveStatus<Invoice extends { status?: string }>(
  invoiceId: string | undefined,
  fetchFn: (id: string) => Promise<Invoice>,
  config: InvoiceLiveStatusConfig = {},
): UseInvoiceLiveStatusReturn<Invoice> {
  const {
    fallbackInterval = 2000,
    maxInterval = 30000,
    backoffMultiplier = 1.5,
    stopOnTerminal = true,
  } = config;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionState, setConnectionState] =
    useState<InvoiceRealtimeState>('idle');

  const fetchFnRef = useRef(fetchFn);
  const invoiceRef = useRef<Invoice | null>(null);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    invoiceRef.current = invoice;
  }, [invoice]);

  const currentIntervalRef = useRef(fallbackInterval);
  const lastEventSignatureRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const terminal = stopOnTerminal && isTerminalStatus(invoice?.status);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchInvoice = useCallback(
    async (manual = false) => {
      if (!invoiceId) return;

      try {
        if (!manual) setIsLoading(true);
        const data = await fetchFnRef.current(invoiceId);
        if (!mountedRef.current) return;

        setInvoice(data);
        setError(null);
        setLastUpdated(new Date());
        currentIntervalRef.current = fallbackInterval;
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        // Back off before the next fallback attempt.
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * backoffMultiplier,
          maxInterval,
        );
      } finally {
        if (!manual && mountedRef.current) setIsLoading(false);
      }
    },
    [invoiceId, fallbackInterval, backoffMultiplier, maxInterval],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial load whenever the invoice id changes.
  useEffect(() => {
    if (!invoiceId) return;
    lastEventSignatureRef.current = null;
    // Defer to a task so the effect body itself never sets state.
    const initialFetchTimer = setTimeout(() => {
      void fetchInvoice(false);
    }, 0);
    return () => {
      clearTimeout(initialFetchTimer);
      clearPollTimer();
    };
  }, [invoiceId, fetchInvoice, clearPollTimer]);

  // Realtime stream subscription.
  useEffect(() => {
    if (!invoiceId || terminal) return;

    let connection: InvoiceRealtimeConnection | null = null;

    const handleEvent = (event: InvoiceStatusEvent) => {
      if (!mountedRef.current || event.invoiceId !== invoiceId) return;

      // Dedupe repeated deliveries of the same transition.
      const signature = `${event.invoiceId}|${event.status}|${event.at}`;
      if (signature === lastEventSignatureRef.current) return;
      lastEventSignatureRef.current = signature;

      // Optimistic flip so the UI reacts immediately.
      setInvoice((prev) =>
        prev ? ({ ...prev, status: event.status } as Invoice) : prev,
      );

      // Authoritative refetch keeps fields like tx_hash accurate.
      void fetchInvoice(false);
    };

    connection = connectInvoiceRealtime({
      onEvent: handleEvent,
      onStateChange: setConnectionState,
    });

    return () => {
      connection?.close();
    };
  }, [invoiceId, terminal, fetchInvoice]);

  // Fallback polling — only while the realtime stream is not open and the
  // invoice has not reached a terminal status.
  useEffect(() => {
    if (!invoiceId || terminal || connectionState === 'open') {
      clearPollTimer();
      return;
    }

    const scheduleNext = () => {
      clearPollTimer();
      pollTimerRef.current = setTimeout(() => {
        void fetchInvoice(false).finally(() => {
          if (
            mountedRef.current &&
            !(stopOnTerminal && isTerminalStatus(invoiceRef.current?.status))
          ) {
            scheduleNext();
          }
        });
      }, currentIntervalRef.current);
    };

    scheduleNext();

    return () => {
      clearPollTimer();
    };
  }, [
    invoiceId,
    terminal,
    connectionState,
    fetchInvoice,
    clearPollTimer,
    stopOnTerminal,
  ]);

  // Catch up on missed transitions when the tab regains focus or the network
  // comes back while the stream is degraded.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const catchUp = () => {
      if (!invoiceId || terminal) return;
      void fetchInvoice(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && connectionState !== 'open') {
        catchUp();
      }
    };

    window.addEventListener('online', catchUp);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', catchUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [invoiceId, terminal, connectionState, fetchInvoice]);

  const refreshStatus = useCallback(async () => {
    await fetchInvoice(true);
  }, [fetchInvoice]);

  return {
    invoice,
    isLoading,
    error,
    lastUpdated,
    refreshStatus,
    isLive: connectionState === 'open',
    connectionState,
  };
}
