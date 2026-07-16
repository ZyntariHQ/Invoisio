'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';

interface OnboardingShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Footer note, e.g. completion hint. */
  footer?: ReactNode;
}

export function OnboardingShell({
  title,
  subtitle,
  children,
  footer,
}: OnboardingShellProps) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl">
          <Link
            href="/"
            className="mb-6 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Back to dashboard
          </Link>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-500">{footer}</div>}
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}

interface OnboardingActionsProps {
  onSave: () => void;
  onSkip?: () => void;
  isSaving: boolean;
  saveLabel?: string;
  nextHref?: string;
}

export function OnboardingActions({
  onSave,
  onSkip,
  isSaving,
  saveLabel = 'Save & continue',
  nextHref,
}: OnboardingActionsProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {isSaving ? 'Saving…' : saveLabel}
      </button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Skip for now
        </button>
      )}
      {nextHref && (
        <Link
          href={nextHref}
          className="ml-auto text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Next step →
        </Link>
      )}
    </div>
  );
}
