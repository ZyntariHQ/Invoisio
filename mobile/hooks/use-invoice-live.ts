import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "./use-auth-store";
import { useConnectivity } from "./use-connectivity";
import {
  connectInvoiceEvents,
  type InvoiceLiveConnectionState,
} from "../lib/invoice-realtime-client";

export type InvoiceLiveStatus =
  | "offline"
  | "connecting"
  | "live"
  | "reconnecting"
  | "unavailable";

export interface UseInvoiceLiveResult {
  status: InvoiceLiveStatus;
  lastEventAt: number | null;
  /** true once the SSE stream is confirmed unusable (e.g. bad token); UI should fall back to polling. */
  shouldPoll: boolean;
}

function toLiveStatus(
  isOffline: boolean,
  connectionState: InvoiceLiveConnectionState | null,
): InvoiceLiveStatus {
  if (isOffline) return "offline";
  switch (connectionState) {
    case "open":
      return "live";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "unavailable";
    default:
      return "connecting";
  }
}

/**
 * Subscribes to the backend realtime invoice-status stream and reports
 * live-update state for a single invoice. Callers should refetch the
 * invoice (e.g. via react-query) whenever `lastEventAt` changes, and use
 * `shouldPoll` to fall back to interval polling when the stream can't stay
 * open (offline, or the server rejected the connection).
 */
export function useInvoiceLive(
  invoiceId: string | undefined,
  enabled = true,
): UseInvoiceLiveResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { isOffline } = useConnectivity();
  const [connectionState, setConnectionState] =
    useState<InvoiceLiveConnectionState | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const invoiceIdRef = useRef(invoiceId);
  invoiceIdRef.current = invoiceId;

  useEffect(() => {
    if (!enabled || isOffline || !accessToken || !invoiceId) {
      setConnectionState(null);
      return;
    }

    const disconnect = connectInvoiceEvents({
      token: accessToken,
      onStateChange: setConnectionState,
      onEvent: (event) => {
        if (event.invoiceId === invoiceIdRef.current) {
          setLastEventAt(Date.now());
        }
      },
    });

    return disconnect;
  }, [enabled, isOffline, accessToken, invoiceId]);

  const status = toLiveStatus(isOffline, connectionState);

  return {
    status,
    lastEventAt,
    shouldPoll: status !== "live",
  };
}
