'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { FileText, Plus, Home, LayoutDashboard, Menu, X, Wallet, LogOut, UserRound } from 'lucide-react';
import { useWalletAuth } from '@/hooks/use-wallet-auth';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-stellar to-accent shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
        <FileText className="h-5 w-5 text-white" strokeWidth={2.5} />
      </div>
      <span className="font-display text-xl font-bold tracking-tight">
        Invoi<span className="gradient-text">sio</span>
      </span>
    </Link>
  );
}

function WalletBadge() {
  const { status, publicKey, connectWallet, signIn, signOut, isLoading, error, message, clearMessage } = useWalletAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!message && !error) return;
    const t = window.setTimeout(clearMessage, 4000);
    return () => window.clearTimeout(t);
  }, [message, error, clearMessage]);

  if (status === 'disconnected') {
    return (
      <button
        type="button"
        onClick={() => { void connectWallet().catch(() => undefined); }}
        disabled={isLoading}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
      >
        <Wallet className="h-4 w-4" />
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  const shortKey = publicKey ? `${publicKey.slice(0, 5)}...${publicKey.slice(-4)}` : '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (status === 'connected') {
            void signIn().catch(() => undefined);
          } else {
            setMenuOpen((v) => !v);
          }
        }}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
          status === 'signed-in'
            ? 'border-success/30 bg-success/10 text-success hover:bg-success/15'
            : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15'
        } disabled:opacity-60`}
      >
        <div className={`h-2 w-2 rounded-full ${status === 'signed-in' ? 'bg-success animate-pulse' : 'bg-warning'}`} />
        <span className="hidden sm:inline font-mono text-xs">{shortKey}</span>
        <span className="sm:hidden font-semibold">
          {isLoading ? 'Loading...' : status === 'signed-in' ? 'Signed In' : 'Sign In'}
        </span>
      </button>

      {status === 'signed-in' && menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-card shadow-xl animate-in-fade-up">
            <div className="border-b p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-card-foreground truncate">
                    {shortKey}
                  </p>
                  <p className="text-xs text-success font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Authenticated
                  </p>
                </div>
              </div>
            </div>
            <div className="p-2">
              <Link
                href="/invoices"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-card-foreground hover:bg-muted transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                My Invoices
              </Link>
              <Link
                href="/invoices/new"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-card-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Invoice
              </Link>
              <button
                type="button"
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/invoices', label: 'Invoices', icon: FileText },
    { href: '/invoices/new', label: 'Create', icon: Plus },
    { href: '/pos', label: 'POS', icon: Wallet },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 no-print">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo />

          <div className="hidden md:flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <WalletBadge />
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 pt-2 border-t animate-in-fade-up">
            <div className="flex flex-col gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive(href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
