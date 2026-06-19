'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMerchant } from '@/hooks/use-merchant';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { useSidebar } from '@/components/sidebar-context';
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavActive,
} from '@/components/dashboard-nav';
import { LogOut, Wallet, Menu, Globe, ChevronRight } from 'lucide-react';

export function Header() {
  const { wallet, isLoading } = useMerchant();
  const { publicKey, status, signOut } = useWalletAuth();
  const { isCollapsed, openMobile } = useSidebar();
  const pathname = usePathname();

  const formatAddress = (addr: string) => {
    if (!addr) return '—';
    if (addr.length <= 12) return addr;
    return `${addr.substring(0, 6)}…${addr.substring(addr.length - 4)}`;
  };

  // Derive page title from pathname
  const getPageTitle = () => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length <= 1) return 'Dashboard';
    const last = segments[segments.length - 1];
    return last.charAt(0).toUpperCase() + last.slice(1);
  };

  // Derive breadcrumb segments
  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((seg, i) => ({
      label: seg.charAt(0).toUpperCase() + seg.slice(1),
      href: '/' + segments.slice(0, i + 1).join('/'),
      isLast: i === segments.length - 1,
    }));
  };

  const merchantWallet = wallet?.publicKey || publicKey || '';
  const isAuthenticated = status === 'signed-in';

  return (
    <header
      className="sticky top-0 z-20 glass-panel"
      style={{
        minHeight: 'var(--header-height)',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <div className="mx-auto flex items-center gap-4 px-4 py-4 sm:px-6 lg:px-8"
        style={{ maxWidth: '1400px' }}
      >
        {/* ── Left: Mobile hamburger + Breadcrumb ─────── */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={openMobile}
            className="flex items-center justify-center rounded-lg p-2 md:hidden"
            style={{
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-default)',
              transition: 'var(--transition-fast)',
            }}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0">
            {/* Breadcrumb */}
            <div className="mb-0.5 hidden items-center gap-1 text-xs sm:flex"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {getBreadcrumbs().map((crumb) => (
                <span key={crumb.href} className="flex items-center gap-1">
                  {crumb.isLast ? (
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {crumb.label}
                    </span>
                  ) : (
                    <>
                      <Link
                        href={crumb.href}
                        className="hover:underline"
                        style={{
                          transition: 'var(--transition-fast)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {crumb.label}
                      </Link>
                      <ChevronRight size={12} />
                    </>
                  )}
                </span>
              ))}
            </div>

            {/* Page title */}
            <h1
              className="truncate text-lg font-semibold sm:text-xl"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {getPageTitle()}
            </h1>
          </div>
        </div>

        {/* ── Right: Status + Wallet + Actions ────────── */}
        <div className="flex shrink-0 items-center gap-3">
          {/* Network badge — hidden on mobile */}
          <div
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:flex"
            style={{
              background: 'var(--color-warning-muted)',
              color: 'var(--color-warning)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <Globe size={12} />
            <span>Testnet</span>
          </div>

          {/* Auth status pill */}
          <div
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium md:flex"
            style={{
              background: isAuthenticated
                ? 'var(--color-success-muted)'
                : 'var(--color-warning-muted)',
              color: isAuthenticated
                ? 'var(--color-success)'
                : 'var(--color-warning)',
              border: `1px solid ${isAuthenticated ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: isAuthenticated
                  ? 'var(--color-success)'
                  : 'var(--color-warning)',
                animation: isAuthenticated ? 'none' : 'pulseGlow 2s infinite',
              }}
            />
            <span>{isAuthenticated ? 'Authenticated' : 'Connecting'}</span>
          </div>

          {/* Wallet balance card */}
          <div
            className="hidden items-center gap-3 rounded-xl px-4 py-2.5 lg:flex"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
              transition: 'var(--transition-fast)',
            }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: 'var(--color-accent-muted)',
                color: 'var(--color-accent)',
              }}
            >
              <Wallet size={16} />
            </div>
            <div>
              <p
                className="text-xs font-medium"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Balance
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {isLoading
                  ? '...'
                  : `${wallet?.balance || '0'} ${wallet?.currency || 'XLM'}`}
              </p>
            </div>
            {wallet?.balanceUSD && (
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                ≈ ${wallet.balanceUSD}
              </span>
            )}
          </div>

          {/* Wallet address chip */}
          <div
            className="hidden items-center gap-2 rounded-xl px-3 py-2 sm:flex"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: isAuthenticated
                  ? 'var(--color-success)'
                  : 'var(--color-text-muted)',
              }}
            />
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {merchantWallet ? formatAddress(merchantWallet) : 'Not connected'}
            </span>
          </div>

          {/* Sign out button */}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center justify-center rounded-xl p-2.5"
            style={{
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border-default)',
              transition: 'var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-danger-muted)';
              e.currentTarget.style.color = 'var(--color-danger)';
              e.currentTarget.style.borderColor = 'var(--color-danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-muted)';
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
            }}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* ── Mobile bottom nav bar ──────────────────────── */}
      <nav
        className="grid gap-2 px-4 pb-3 md:hidden"
        style={{ gridTemplateColumns: `repeat(${DASHBOARD_NAV_ITEMS.length}, 1fr)` }}
      >
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isDashboardNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-center"
              style={{
                transition: 'var(--transition-fast)',
                background: active
                  ? 'var(--color-accent-muted)'
                  : 'var(--color-bg-surface)',
                color: active
                  ? 'var(--color-accent-hover)'
                  : 'var(--color-text-muted)',
                border: active
                  ? '1px solid var(--color-accent)'
                  : '1px solid var(--color-border-default)',
              }}
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Mobile wallet info row ─────────────────────── */}
      <div
        className="grid grid-cols-2 gap-2 px-4 pb-3 sm:hidden"
      >
        <div
          className="rounded-xl px-3 py-2"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <p
            className="text-[10px] font-medium uppercase"
            style={{
              letterSpacing: '0.15em',
              color: 'var(--color-text-muted)',
            }}
          >
            Wallet
          </p>
          <p
            className="mt-0.5 text-xs font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {formatAddress(merchantWallet)}
          </p>
        </div>
        <div
          className="rounded-xl px-3 py-2"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <p
            className="text-[10px] font-medium uppercase"
            style={{
              letterSpacing: '0.15em',
              color: 'var(--color-text-muted)',
            }}
          >
            Balance
          </p>
          <p
            className="mt-0.5 text-xs font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {isLoading
              ? '...'
              : `${wallet?.balance || '0'} ${wallet?.currency || 'XLM'}`}
          </p>
        </div>
      </div>
    </header>
  );
}
