'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { DASHBOARD_NAV_ITEMS, isDashboardNavActive } from '@/components/dashboard-nav';

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useWalletAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-slate-950 text-slate-50 md:flex">
      <div className="border-b border-white/10 px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Invoisio</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Merchant Workspace</h2>
        <p className="mt-1 text-sm text-slate-400">
          Invoices, wallet health, and merchant settings.
        </p>
      </div>

      <nav className="flex-1 space-y-2 px-3 py-6">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isDashboardNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${
                isActive
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
