'use client';

import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';
import { ActivationChecklist } from '@/components/activation-checklist';
import { WalletAuthControls } from '@/components/wallet-auth-controls';
import { useMerchantChecklist } from '@/hooks/use-merchant-checklist';
import { useEffect } from 'react';

function DashboardContent() {
  const { checklist, isLoading, progress, isCompleted, syncChecklist } =
    useMerchantChecklist();

  // Refresh server-derived completion (e.g. invoices created elsewhere) once on mount.
  useEffect(() => {
    syncChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading && !checklist) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-500">
            {isCompleted
              ? 'Your merchant account is active. Create and track invoices.'
              : 'Finish setting up your account to start getting paid.'}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <WalletAuthControls />
          <Link
            href="/pos"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Invoice
          </Link>
        </div>
      </div>

      {!isCompleted ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <ActivationChecklist />
          <aside className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Why activate?</h2>
            <p className="mt-2 text-sm text-gray-500">
              Completing these steps ensures your invoices carry your brand, route
              payouts to your wallet, and default to the asset you want. Progress is
              saved automatically.
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {checklist?.completedAt
                ? 'Activation complete.'
                : `${progress}% complete`}
            </p>
          </aside>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                🎉 You’re all set!
              </p>
              <p className="mt-1 text-sm text-emerald-700">
                Your activation is complete. Create your first invoice to start
                getting paid on Stellar.
              </p>
            </div>
            <Link
              href="/invoices"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Go to Invoices
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <DashboardContent />
      </div>
    </RequireAuth>
  );
}
