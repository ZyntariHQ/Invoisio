'use client';

import Link from 'next/link';
import { FileText, ShieldCheck, Zap, Globe2 } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t bg-card/40 mt-24 no-print">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-stellar to-accent shadow-md shadow-primary/20">
              <FileText className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display text-xl font-bold">
              Invoi<span className="gradient-text">sio</span>
            </span>
          </Link>
          <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
            Privacy-first invoice platform for freelancers and merchants.
            AI-assisted invoices, settled on Stellar — fast, low-cost,
            crypto-native payments you control.
          </p>
          <div className="mt-5 flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Non-custodial</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5 text-warning" />
              <span>Sub-cent fees</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Globe2 className="h-3.5 w-3.5 text-primary" />
              <span>Global</span>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-card-foreground mb-4">Product</h4>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link href="/invoices" className="text-muted-foreground hover:text-foreground transition-colors">
                Invoices
              </Link>
            </li>
            <li>
              <Link href="/invoices/new" className="text-muted-foreground hover:text-foreground transition-colors">
                Create Invoice
              </Link>
            </li>
            <li>
              <Link href="/pos" className="text-muted-foreground hover:text-foreground transition-colors">
                Point of Sale
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                Wallet Sign-In
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-card-foreground mb-4">Resources</h4>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a
                href="https://developers.stellar.org/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                Stellar Docs
              </a>
            </li>
            <li>
              <a
                href="https://github.com/stellar/stellar-protocol/blob/master/core/cap-0005.md" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                SEP-0007
              </a>
            </li>
            <li>
              <a
                href="https://freighter.app/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                Freighter Wallet
              </a>
            </li>
            <li>
              <a
                href="https://grantfox.xyz/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                GrantFox
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          © {year} Invoisio. Built with ♥ for freelancers on Stellar.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com"
            aria-label="GitHub"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </a>
          <div className="flex items-center gap-1.5 rounded-full rounded-lg border px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-xs font-medium">Stellar Testnet</span>
          </div>
        </div>
      </div>
    </div>
    </footer>
  );
}
