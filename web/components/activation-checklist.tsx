'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, Sparkles, ArrowRight } from 'lucide-react';
import {
  CHECKLIST_STEPS,
  useMerchantChecklist,
} from '@/hooks/use-merchant-checklist';

interface ActivationChecklistProps {
  /** Compact mode renders a slimmer card suitable for a dashboard sidebar. */
  compact?: boolean;
}

export function ActivationChecklist({ compact = false }: ActivationChecklistProps) {
  const {
    checklist,
    isLoading,
    error,
    progress,
    completedCount,
    totalSteps,
    isCompleted,
    isSyncing,
    syncChecklist,
  } = useMerchantChecklist();

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-gray-200" />
        <div className="mt-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
        <p className="font-medium">Could not load your activation checklist.</p>
        <p className="mt-1 text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="activation-checklist-heading"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h2
            id="activation-checklist-heading"
            className="text-base font-semibold text-gray-900"
          >
            Activate your merchant account
          </h2>
        </div>
        {isCompleted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Complete
          </span>
        ) : (
          <button
            type="button"
            onClick={syncChecklist}
            disabled={isSyncing}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {isSyncing ? 'Syncing…' : 'Refresh status'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-medium text-gray-500">
          <span>
            {completedCount} of {totalSteps} steps done
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ol className="mt-6 space-y-3">
        {CHECKLIST_STEPS.map((step) => {
          const done = checklist ? checklist[step.key] === true : false;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
              >
                <span className="flex-shrink-0" aria-hidden="true">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {step.title}
                  </span>
                  {!compact && (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {step.description}
                    </span>
                  )}
                </span>
                <span className="flex-shrink-0 text-xs font-semibold text-blue-600 group-hover:underline">
                  {done ? 'View' : step.cta}
                  <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
