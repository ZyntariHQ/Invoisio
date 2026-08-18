'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  WebhookService,
  type WebhookDeliveriesResult,
  type WebhookDelivery,
  type WebhookDeadLetter,
} from '@/lib/webhook-service';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({
  status,
}: {
  status: 'pending' | 'success' | 'failed' | string;
}) {
  const map: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    pending_retry: 'bg-orange-100 text-orange-800',
    requeued: 'bg-blue-100 text-blue-800',
    recovered: 'bg-emerald-100 text-emerald-800',
  };

  const label: Record<string, string> = {
    pending: 'Pending',
    success: 'Delivered',
    failed: 'Failed',
    pending_retry: 'Dead-letter',
    requeued: 'Requeued',
    recovered: 'Recovered',
  };

  const cls = map[status] ?? 'bg-gray-100 text-gray-700';
  const text = label[status] ?? status;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {text}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </h4>
  );
}

// ── Delivery row ────────────────────────────────────────────────────────────

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusBadge status={delivery.status} />
          <span className="truncate font-mono text-xs text-gray-600">
            {delivery.invoice?.invoiceNumber ?? delivery.id.slice(0, 8) + '…'}
          </span>
        </div>
        <span className="shrink-0 text-xs text-gray-400">
          {formatDate(delivery.createdAt)}
        </span>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <dl className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600 space-y-1.5">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-400">URL</dt>
            <dd className="break-all font-mono">{delivery.url}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-400">Attempts</dt>
            <dd>{delivery.attempts}</dd>
          </div>
          {delivery.lastAttemptAt && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-400">Last attempt</dt>
              <dd>{formatDate(delivery.lastAttemptAt)}</dd>
            </div>
          )}
          {delivery.status === 'pending' && delivery.nextAttemptAt && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-400">Next attempt</dt>
              <dd>{formatDate(delivery.nextAttemptAt)}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}

// ── Dead-letter row ─────────────────────────────────────────────────────────

function DeadLetterRow({ item }: { item: WebhookDeadLetter }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-orange-200 bg-orange-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-orange-100/60"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusBadge status={item.status} />
          <span className="truncate font-mono text-xs text-gray-600">
            {item.invoice?.invoiceNumber ?? item.id.slice(0, 8) + '…'}
          </span>
        </div>
        <span className="shrink-0 text-xs text-gray-400">
          {formatDate(item.exhaustedAt)}
        </span>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <dl className="border-t border-orange-200 px-4 py-3 text-xs text-gray-600 space-y-1.5">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-400">URL</dt>
            <dd className="break-all font-mono">{item.url}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-400">Attempts</dt>
            <dd>{item.failedAttempts}</dd>
          </div>
          {item.lastHttpStatus !== null && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-400">HTTP status</dt>
              <dd>{item.lastHttpStatus}</dd>
            </div>
          )}
          {item.lastError && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-400">Last error</dt>
              <dd className="break-words text-red-700">{item.lastError}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-gray-400">Exhausted at</dt>
            <dd>{formatDate(item.exhaustedAt)}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

// ── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ data }: { data: WebhookDeliveriesResult }) {
  const { deliveries, deadLetters } = data;
  const total = deliveries.length;
  const succeeded = deliveries.filter((d) => d.status === 'success').length;
  const pending = deliveries.filter((d) => d.status === 'pending').length;
  const failed = deliveries.filter((d) => d.status === 'failed').length;
  const dlCount = deadLetters.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Total" value={total} />
      <StatTile label="Delivered" value={succeeded} variant="success" />
      <StatTile label="Pending" value={pending} variant="warning" />
      <StatTile
        label="Dead-letters"
        value={failed + dlCount}
        variant={failed + dlCount > 0 ? 'error' : 'neutral'}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  variant?: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const colours = {
    neutral: 'bg-gray-50 text-gray-700',
    success: 'bg-emerald-50 text-emerald-800',
    warning: 'bg-yellow-50 text-yellow-800',
    error: 'bg-red-50 text-red-800',
  };
  return (
    <div className={`rounded-xl p-3 ${colours[variant]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WebhookDeliveryHealth() {
  const [data, setData] = useState<WebhookDeliveriesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await WebhookService.getDeliveries(20);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load delivery history.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty =
    data && data.deliveries.length === 0 && data.deadLetters.length === 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            Delivery health
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Recent webhook deliveries and any exhausted dead-letters.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="mt-4">
            <SummaryBar data={data} />
          </div>

          {isEmpty ? (
            <p className="mt-6 text-center text-sm text-gray-400">
              No deliveries yet. Trigger a test send to verify your endpoint.
            </p>
          ) : (
            <>
              {data.deadLetters.length > 0 && (
                <>
                  <SectionTitle>Dead-letters ({data.deadLetters.length})</SectionTitle>
                  <ul className="mt-2 space-y-2">
                    {data.deadLetters.map((dl) => (
                      <DeadLetterRow key={dl.id} item={dl} />
                    ))}
                  </ul>
                </>
              )}

              {data.deliveries.length > 0 && (
                <>
                  <SectionTitle>
                    Recent deliveries ({data.deliveries.length})
                  </SectionTitle>
                  <ul className="mt-2 space-y-2">
                    {data.deliveries.map((d) => (
                      <DeliveryRow key={d.id} delivery={d} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Inline icons ───────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
        expanded ? 'rotate-180' : ''
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
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
