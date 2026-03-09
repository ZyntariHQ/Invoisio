/**
 * Invoice Status Polling Hook
 * Handles polling for invoice status updates with exponential backoff and retry logic
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

export interface PollConfig {
  /** Initial polling interval in ms (default: 2000) */
  initialInterval?: number;
  /** Maximum interval between polls (default: 30000) */
  maxInterval?: number;
  /** Exponential backoff multiplier (default: 1.5) */
  backoffMultiplier?: number;
  /** Maximum number of retries on error (default: 5) */
  maxRetries?: number;
  /** Should stop polling when status changes to 'paid' (default: true) */
  stopOnPaid?: boolean;
}

export interface UsePollInvoiceStatusReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any | null;
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshStatus: () => Promise<void>;
  stop: () => void;
  pollCount: number;
}

/**
 * Hook for polling invoice status with intelligent backoff and error handling
 * @param invoiceId Invoice ID
 * @param fetchFn Function to fetch invoice (should return invoice data)
 * @param config Polling configuration
 * @returns Invoice status and control methods
 */
export function usePollInvoiceStatus(
  invoiceId: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchFn: (id: string) => Promise<any>,
  config: PollConfig = {},
): UsePollInvoiceStatusReturn {
  const {
    initialInterval = 2000,
    maxInterval = 30000,
    backoffMultiplier = 1.5,
    maxRetries = 5,
    stopOnPaid = true,
  } = config;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoice, setInvoice] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPollingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIntervalRef = useRef(initialInterval);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);

  const setIsPolling = useCallback((val: boolean) => {
    isPollingRef.current = val;
    setIsPollingState(val);
  }, []);

  const fetchInvoice = useCallback(
    async (manual = false) => {
      if (!invoiceId) return;

      try {
        if (!manual) setIsLoading(true);
        const data = await fetchFn(invoiceId);

        if (!isMountedRef.current) return;

        setInvoice(data);
        setError(null);
        setLastUpdated(new Date());
        retryCountRef.current = 0;
        currentIntervalRef.current = initialInterval;

        // Stop polling if paid and stopOnPaid is true
        if (stopOnPaid && data?.status === 'paid') {
          setIsPolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);

        // Increment retry count and stop if exceeded
        retryCountRef.current++;
        if (retryCountRef.current >= maxRetries) {
          setIsPolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        // Increase interval with exponential backoff
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * backoffMultiplier,
          maxInterval,
        );
      } finally {
        if (!manual) setIsLoading(false);
      }
    },
    [invoiceId, fetchFn, initialInterval, maxRetries, backoffMultiplier, maxInterval, stopOnPaid, setIsPolling],
  );

  const startPolling = useCallback(() => {
    if (isPollingRef.current || !invoiceId) return;

    setIsPolling(true);
    retryCountRef.current = 0;
    currentIntervalRef.current = initialInterval;

    // Initial fetch
    fetchInvoice(false).then(() => {
      if (!isMountedRef.current || !isPollingRef.current) return;

      // Set up interval for subsequent fetches
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setPollCount((c: number) => c + 1);
        fetchInvoice(false);
      }, currentIntervalRef.current);
    });
  }, [invoiceId, initialInterval, fetchInvoice, setIsPolling]);

  const stop = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    retryCountRef.current = 0;
    currentIntervalRef.current = initialInterval;
  }, [initialInterval, setIsPolling]);

  const refreshStatus = useCallback(async () => {
    await fetchInvoice(true);
  }, [fetchInvoice]);

  // Handle lifecycle and auto-start
  useEffect(() => {
    isMountedRef.current = true;
    
    if (invoiceId && !isPollingRef.current) {
      startPolling();
    }

    return () => {
      stop();
      isMountedRef.current = false;
    };
  }, [invoiceId, startPolling, stop]);

  // Update interval when status changes (or fetchInvoice logic triggers it)
  useEffect(() => {
    if (intervalRef.current && isPolling) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setPollCount((c: number) => c + 1);
        fetchInvoice(false);
      }, currentIntervalRef.current);
    }
  }, [isPolling, fetchInvoice]);

  return {
    invoice,
    isLoading,
    isPolling,
    error,
    lastUpdated,
    refreshStatus,
    stop,
    pollCount,
  };
}
