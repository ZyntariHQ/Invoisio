'use client';

import { Check, Copy, RefreshCcw, Share2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPaymentSharePayload,
  copyPaymentUri,
  isNativeShareSupported,
  sharePaymentRequest,
} from '@/lib/wallet-fallback';

const COPY_FAILED_MESSAGE =
  "Couldn't copy the payment request. Select it below and copy it manually.";
const SHARE_FAILED_MESSAGE =
  "Couldn't share the payment request. You can copy the payment URI instead.";

interface WalletFallbackSheetProps {
  open: boolean;
  onClose: () => void;
  /** The same SEP-0007 payment URI used for direct wallet handoff. */
  paymentUri: string;
  invoiceNumber?: string;
  amountLabel?: string;
  onRetry?: () => void;
}

export default function WalletFallbackSheet({
  open,
  onClose,
  paymentUri,
  invoiceNumber,
  amountLabel,
  onRetry,
}: WalletFallbackSheetProps) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Native share support can only be detected in the browser; defer the
  // update so the first client render matches the server-rendered markup.
  useEffect(() => {
    const id = window.setTimeout(() => setCanShare(isNativeShareSupported()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  const resetTransientState = useCallback(() => {
    setCopied(false);
    setStatusMessage(null);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    resetTransientState();
    onCloseRef.current();
  }, [resetTransientState]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    resetTransientState();
    onRetry?.();
  }, [resetTransientState, onRetry]);

  const handleCopy = useCallback(async () => {
    const success = await copyPaymentUri(paymentUri);
    if (success) {
      setCopied(true);
      setStatusMessage('Payment request copied');
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    } else {
      setCopied(false);
      setStatusMessage(COPY_FAILED_MESSAGE);
    }
  }, [paymentUri]);

  const handleShare = useCallback(async () => {
    const payload = buildPaymentSharePayload({ invoiceNumber, amountLabel, paymentUri });
    const outcome = await sharePaymentRequest(payload);

    if (outcome === 'failed' || outcome === 'unsupported') {
      setStatusMessage(SHARE_FAILED_MESSAGE);
    } else {
      setStatusMessage(null);
    }
  }, [invoiceNumber, amountLabel, paymentUri]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/60"
        aria-hidden="true"
        onClick={handleClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-fallback-title"
        aria-describedby="wallet-fallback-description"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl outline-none sm:rounded-2xl"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="wallet-fallback-title" className="text-lg font-bold text-slate-900">
              Open your wallet another way
            </h2>
            <p id="wallet-fallback-description" className="mt-1 text-sm text-slate-600">
              We couldn&apos;t open your wallet directly. Share or copy the payment
              request to complete your payment.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close fallback options"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`mt-4 min-h-[1.25rem] text-sm font-medium ${
            statusMessage === COPY_FAILED_MESSAGE || statusMessage === SHARE_FAILED_MESSAGE
              ? 'text-red-700'
              : 'text-emerald-700'
          }`}
        >
          {statusMessage}
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {canShare && (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
            >
              <Share2 className="h-4 w-4" />
              Share payment request
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? 'Copied' : 'Copy payment URI'}
          </button>

          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Try wallet again
            </button>
          )}
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payment request
          </p>
          <p className="mt-1 max-h-24 select-all overflow-y-auto break-all font-mono text-xs text-slate-700">
            {paymentUri}
          </p>
        </div>
      </div>
    </div>
  );
}
