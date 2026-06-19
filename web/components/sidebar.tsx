'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, PanelLeftClose, PanelLeft, Zap } from 'lucide-react';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { useSidebar } from '@/components/sidebar-context';
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavActive,
} from '@/components/dashboard-nav';

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useWalletAuth();
  const { isCollapsed, isMobileOpen, toggleCollapsed, closeMobile } =
    useSidebar();

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* ── Brand Header ───────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-6"
        style={{ borderBottom: '1px solid var(--color-border-default)' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background:
              'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
            boxShadow: '0 0 20px var(--color-accent-glow)',
          }}
        >
          <Zap size={18} color="#fff" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0 animate-fade-in">
            <p
              className="text-xs font-bold uppercase"
              style={{
                letterSpacing: '0.25em',
                color: 'var(--color-text-secondary)',
              }}
            >
              Invoisio
            </p>
            <p
              className="mt-0.5 truncate text-sm font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Merchant Workspace
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────── */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isDashboardNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => closeMobile()}
              title={isCollapsed ? item.label : undefined}
              className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{
                transition: 'var(--transition-fast)',
                background: isActive
                  ? 'var(--color-accent-muted)'
                  : 'transparent',
                color: isActive
                  ? 'var(--color-accent-hover)'
                  : 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                  style={{
                    background:
                      'linear-gradient(180deg, var(--color-accent), #8b5cf6)',
                  }}
                />
              )}

              <Icon size={20} className="shrink-0" />

              {!isCollapsed && (
                <span className="truncate text-sm font-medium">
                  {item.label}
                </span>
              )}

              {/* Badge */}
              {!isCollapsed && item.badge != null && (
                <span
                  className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    background: 'var(--color-accent-muted)',
                    color: 'var(--color-accent-hover)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────── */}
      <div
        className="p-3"
        style={{ borderTop: '1px solid var(--color-border-default)' }}
      >
        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="mb-2 hidden w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium md:flex"
          style={{
            color: 'var(--color-text-muted)',
            transition: 'var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-hover)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          {isCollapsed ? (
            <PanelLeft size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium"
          style={{
            color: 'var(--color-text-secondary)',
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
            e.currentTarget.style.color = 'var(--color-text-secondary)';
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
          }}
        >
          <LogOut size={18} />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col md:flex"
        style={{
          width: isCollapsed
            ? 'var(--sidebar-collapsed)'
            : 'var(--sidebar-width)',
          background: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--color-border-default)',
          transition: 'width var(--transition-slow)',
        }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile Drawer ──────────────────────────────── */}
      {isMobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="sidebar-backdrop animate-fade-in md:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside
            className="animate-slide-in-left fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col md:hidden"
            style={{
              background: 'var(--color-bg-secondary)',
              borderRight: '1px solid var(--color-border-default)',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.5)',
            }}
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
