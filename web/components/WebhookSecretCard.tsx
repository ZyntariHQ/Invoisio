'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WebhookService,
  type WebhookSecretMetadata,
  type WebhookSecretRotationResult,
} from '@/lib/webhook-service';

// ── Sub-components ─────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available – silently fail
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={copied ? 'Copied!' : label}
    >
      {copied ? (
        <>
          <CheckIcon className="mr-1 h-3.5 w-3.5 text-emerald-600" />
          Copied!
        </>
      ) : (
        <>
          <ClipboardIcon className="mr-1 h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}

/** One-time new-secret reveal panel shown after a successful rotation. */
function NewSecretReveal({
  secret,
  onDismiss,
}: {
  secret: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            ⚠ Copy your new signing secret now
          </p>
          <p className="mt-1 text-xs text-amber-700">
            This is the only time the raw secret will be shown. Once you
            dismiss this panel it cannot be retrieved.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
            <code className="flex-1 break-all font-mono text-xs text-gray-900">
              {secret}
            </code>
            <CopyButton text={secret} label="Copy secret" />
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 rounded p-1 text-amber-600 hover:bg-amber-100"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Confirmation dialog shown before executing a destructive rotation. */
function ConfirmDialog({
  onConfirm,
  onCancel,
  isLoading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  // Focus trap: keep focus inside the dialog
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-dialog-title"
      aria-describedby="rotate-dialog-desc"
      className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4"
    >
      <p
        id="rotate-dialog-title"
        className="text-sm font-semibold text-red-900"
      >
        Rotate webhook secret?
      </p>
      <p id="rotate-dialog-desc" className="mt-1 text-xs text-red-700">
        Rotating the secret immediately invalidates the current signing key.
        Any receiver still verifying with the old secret will reject future
        deliveries until it is updated.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Rotating…' : 'Yes, rotate secret'}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WebhookSecretCard() {
  const [metadata, setMetadata] = useState<WebhookSecretMetadata | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationResult, setRotationResult] =
    useState<WebhookSecretRotationResult | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);

  // Load metadata on mount
  useEffect(() => {
    let cancelled = false;
    WebhookService.getSecretMetadata()
      .then((data) => {
        if (!cancelled) setMetadata(data);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load secret info.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRotateConfirm = useCallback(async () => {
    setIsRotating(true);
    setRotationError(null);
    try {
      const result = await WebhookService.rotateSecret();
      setRotationResult(result);
      setMetadata(result.metadata);
      setShowConfirm(false);
    } catch (err) {
      setRotationError(
        err instanceof Error ? err.message : 'Failed to rotate secret.',
      );
      setShowConfirm(false);
    } finally {
      setIsRotating(false);
    }
  }, []);

  const handleDismissReveal = useCallback(() => {
    setRotationResult(null);
  }, []);

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (!metadata && !loadError) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-4 w-64 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="text-base font-bold text-gray-900">Signing secret</h3>
      <p className="mt-1 text-sm text-gray-500">
        Invoisio signs every webhook delivery with an HMAC-SHA256 signature
        computed from this secret. Verify the{' '}
        <code className="rounded bg-gray-100 px-1 text-xs">
          x-invoisio-signature
        </code>{' '}
        header on your server to reject forged payloads.
      </p>

      {loadError ? (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </p>
      ) : metadata!.hasSecret ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <code className="flex-1 font-mono text-sm text-gray-800">
            {metadata!.maskedSecret}
          </code>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Active
          </span>
          {metadata!.secretLength && (
            <span className="shrink-0 text-xs text-gray-400">
              {metadata!.secretLength} chars
            </span>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          No signing secret set. Click <strong>Generate secret</strong> to
          create one.
        </div>
      )}

      {rotationError && (
        <p
          className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900"
          role="alert"
        >
          {rotationError}
        </p>
      )}

      {rotationResult && !showConfirm && (
        <NewSecretReveal
          secret={rotationResult.secret}
          onDismiss={handleDismissReveal}
        />
      )}

      {showConfirm && (
        <ConfirmDialog
          onConfirm={handleRotateConfirm}
          onCancel={() => setShowConfirm(false)}
          isLoading={isRotating}
        />
      )}

      {!showConfirm && !rotationResult && (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isRotating}
          className="mt-4 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        >
          <ArrowPathIcon className="mr-2 h-4 w-4 text-gray-500" />
          {metadata?.hasSecret ? 'Rotate secret' : 'Generate secret'}
        </button>
      )}
    </div>
  );
}

// ── Inline icons (no external dependency needed) ───────────────────────────

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2" width="10" height="4" rx="1" />
      <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowPathIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
