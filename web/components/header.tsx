'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMerchant } from '@/hooks/use-merchant';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { DASHBOARD_NAV_ITEMS, isDashboardNavActive } from '@/components/dashboard-nav';
import { LogOut, Wallet } from 'lucide-react';

export function Header() {
  const { wallet, isLoading } = useMerchant();
  const { publicKey, status, signOut } = useWalletAuth();
  const pathname = usePathname();

  const formatAddress = (addr: string) => {
    if (!addr) return 'Wallet not connected';

    if (addr.length <= 12) {
      return addr;
    }

    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const merchantName = wallet?.name || 'Merchant workspace';
  const merchantWallet = wallet?.publicKey || publicKey || '';
  const statusLabel = status === 'signed-in' ? 'Authenticated' : 'Waiting for wallet';
  const statusClass =
    status === 'signed-in'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Merchant Dashboard
              </p>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            <div>
              <h1 className="truncate text-xl font-semibold text-slate-950 sm:text-2xl">
                {isLoading ? 'Loading wallet context...' : merchantName}
              </h1>
              <p className="mt-1 truncate text-sm text-slate-500">
                {merchantWallet ? formatAddress(merchantWallet) : 'Connecting to backend wallet context'}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <div className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm">
                <Wallet size={18} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Balance</p>
                <p className="text-sm font-semibold text-slate-950">
                  {isLoading ? 'Loading...' : `${wallet?.balance || '0'} ${wallet?.currency || 'XLM'}`}
                </p>
                {wallet?.balanceUSD && (
                  <p className="text-xs text-slate-500">≈ ${wallet.balanceUSD}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <nav className="grid grid-cols-3 gap-2 md:hidden">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isDashboardNavActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-center transition-colors ${
                  active
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon size={18} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Wallet</p>
            <p className="mt-1 text-sm font-medium text-slate-950">{formatAddress(merchantWallet)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Balance</p>
            <p className="mt-1 text-sm font-medium text-slate-950">
              {isLoading ? 'Loading...' : `${wallet?.balance || '0'} ${wallet?.currency || 'XLM'}`}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
