'use client';

import { useCallback, useState } from 'react';
import { WebhookService, type TestSendResult } from '@/lib/webhook-service';

type UIState = 'idle' | 'loading' | 'success' | 'error';

function ResultPanel({
  result,
  error,
}: {
  result: TestSendResult | null;
  error: string | null;
}) {
  // Hard API/network error (e.g. no webhook URL configured)
  if (error) {
    return (
      <div
        role="alert"
        className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-red-900">Request failed</p>
          <p className="mt-0.5 text-xs text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.success) {
    return (
      <div
        role="status"
        className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
      >
        <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            Test delivered successfully
          </p>
          <p className="mt-0.5 text-xs text-emerald-700">
            Your endpoint responded with HTTP {result.httpStatus}. Webhook
            delivery is working correctly.
          </p>
        </div>
      </div>
    );
  }

  // Result returned but not successful (endpoint returned non-2xx)
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4"
    >
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
      <div>
        <p className="text-sm font-semibold text-orange-900">
          Test delivery failed
          {result.httpStatus !== null && (
            <span className="ml-2 font-mono text-xs text-orange-700">
              HTTP {result.httpStatus}
            </span>
          )}
        </p>
        {result.error && (
          <p className="mt-0.5 break-words text-xs text-orange-700">
            {result.error}
          </p>
        )}
        <p className="mt-2 text-xs text-orange-600">
          Check that your endpoint is publicly accessible and returns a 2xx
          response within 8 seconds.
        </p>
      </div>
    </div>
  );
}

export function WebhookTestSend() {
  const [uiState, setUiState] = useState<UIState>('idle');
  const [result, setResult] = useState<TestSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    setUiState('loading');
    setResult(null);
    setError(null);

    try {
      const res = await WebhookService.testSend();
      setResult(res);
      setUiState(res.success ? 'success' : 'error');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error sending test.',
      );
      setUiState('error');
    }
  }, []);

  const handleReset = useCallback(() => {
    setUiState('idle');
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="text-base font-bold text-gray-900">Test send</h3>
      <p className="mt-1 text-sm text-gray-500">
        Send a synthetic{' '}
        <code className="rounded bg-gray-100 px-1 text-xs">test</code> event to
        your configured webhook URL. The payload is not persisted and will not
        appear in delivery history.
      </p>

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-medium text-gray-500">
          Example payload
        </p>
        <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-700 shadow-sm">
          {JSON.stringify(
            {
              event: 'test',
              invoiceId: 'test-invoice-id',
              status: 'test',
              txHash: null,
              timestamp: '<iso-timestamp>',
            },
            null,
            2,
          )}
        </pre>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={uiState === 'loading'}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {uiState === 'loading' ? (
            <>
              <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="mr-2 h-4 w-4" />
              Send test webhook
            </>
          )}
        </button>

        {(uiState === 'success' || uiState === 'error') && (
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      <ResultPanel result={result} error={error} />
    </div>
  );
}

// ── Inline icons ───────────────────────────────────────────────────────────

function CheckCircleIcon({ className }: { className?: string }) {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ExclamationTriangleIcon({ className }: { className?: string }) {
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
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function PaperAirplaneIcon({ className }: { className?: string }) {
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
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
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
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
