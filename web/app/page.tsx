import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  QrCode,
  FileText,
  Wallet,
  Zap,
  Shield,
  Globe,
  ArrowRight,
  CheckCircle2,
  Receipt,
  BarChart3,
  Clock,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Small reusable pieces                                              */
/* ------------------------------------------------------------------ */

function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
      {children}
    </span>
  );
}

function CtaButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const base =
    'inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-colors';
  const styles =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';
  return (
    <Link href={href} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: QrCode,
    title: 'Instant QR Payments',
    description:
      'Generate payment QR codes in seconds. Customers scan with any Stellar-compatible wallet and pay instantly — no manual address entry.',
  },
  {
    icon: FileText,
    title: 'Professional Invoices',
    description:
      'Create branded invoices with automatic payment tracking. Send them to clients via link or email and get paid on-chain.',
  },
  {
    icon: Wallet,
    title: 'Wallet-Native Auth',
    description:
      'No passwords, no email verification loops. Connect your Freighter wallet, sign a challenge, and you are in.',
  },
  {
    icon: Zap,
    title: 'Multi-Asset Support',
    description:
      'Accept XLM, USDC, and any Stellar asset your business needs. Switch between assets with a single toggle.',
  },
  {
    icon: Shield,
    title: 'On-Chain Transparency',
    description:
      'Every payment is recorded on the Stellar ledger. Reconcile accounts with a single click — no more spreadsheets.',
  },
  {
    icon: Globe,
    title: 'Built for Global Commerce',
    description:
      'Stellar settles cross-border payments in ~5 seconds. Invoice in any currency, get paid anywhere in the world.',
  },
];

const workflowSteps = [
  {
    step: '01',
    icon: Wallet,
    title: 'Connect Your Wallet',
    description: 'Install the Freighter browser extension and sign in with one click.',
  },
  {
    step: '02',
    icon: Receipt,
    title: 'Create an Invoice',
    description: 'Enter the amount, choose an asset, add a memo — your payment request is ready.',
  },
  {
    step: '03',
    icon: QrCode,
    title: 'Share or Display QR',
    description: 'Show the QR code at your counter or send the invoice link to your client.',
  },
  {
    step: '04',
    icon: CheckCircle2,
    title: 'Get Paid & Track',
    description: 'Payments settle on-chain instantly. Monitor status in real time from your dashboard.',
  },
];

const stats = [
  { value: '~5 s', label: 'Settlement time' },
  { value: '< $0.001', label: 'Per transaction' },
  { value: '170+', label: 'Countries supported' },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
              <Receipt className="h-4 w-4" />
            </div>
            Invoisio
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              Sign In
            </Link>
            <Link
              href="/invoices/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Create Invoice
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* subtle gradient backdrop */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-blue-50/60 to-transparent dark:from-blue-950/30" />

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionBadge>Stellar-powered invoicing</SectionBadge>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              Invoice &amp; get paid{' '}
              <span className="text-blue-600 dark:text-blue-400">in seconds</span>,
              <br className="hidden sm:block" /> not days.
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">
              Invoisio is the merchant-first invoicing platform built on Stellar.
              Create professional invoices, accept crypto payments via QR, and
              track every transaction on-chain — all from one dashboard.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <CtaButton href="/login">
                Get Started <ArrowRight className="h-4 w-4" />
              </CtaButton>
              <CtaButton href="/pos" variant="secondary">
                Try Point-of-Sale
              </CtaButton>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-8 border-t border-gray-200 pt-10 dark:border-gray-800">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <SectionBadge>Features</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              Everything a modern merchant needs
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Purpose-built tools that replace clunky banking portals and spreadsheets.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Merchant Workflow ───────────────────────────────────── */}
      <section className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <SectionBadge>How it works</SectionBadge>
            <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
              From wallet connect to paid — four simple steps
            </h2>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              No lengthy onboarding. Start accepting payments in under a minute.
            </p>
          </div>

          <div className="relative mt-16">
            {/* connector line (desktop) */}
            <div className="absolute left-0 right-0 top-12 hidden h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 lg:block dark:from-blue-900 dark:via-blue-600 dark:to-blue-900" />

            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((s) => (
                <div key={s.step} className="relative text-center">
                  <div className="relative z-10 mx-auto flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-blue-200 bg-white shadow-sm dark:border-blue-800 dark:bg-gray-950">
                    <s.icon className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                    <span className="mt-1 text-xs font-bold text-gray-400 dark:text-gray-500">
                      STEP {s.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Stellar ─────────────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionBadge>Why Stellar</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
                Built on the network designed for payments
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Stellar was created to make moving money as easy as sending an email.
                Invoisio taps into that infrastructure so your business benefits from
                near-instant settlement, negligible fees, and built-in asset issuance.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  { icon: Clock, text: 'Finality in ~5 seconds — no waiting for confirmations' },
                  { icon: BarChart3, text: 'Transparent on-chain ledger for effortless accounting' },
                  { icon: Globe, text: 'Send and receive payments across 170+ countries' },
                  { icon: Shield, text: 'Non-custodial — your keys, your funds, always' },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
                      <item.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* decorative card */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Invoice #INV-0042
                  </span>
                  <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                    Paid
                  </span>
                </div>
                <p className="mt-6 text-4xl font-bold text-gray-900 dark:text-white">
                  1,250.00{' '}
                  <span className="text-lg font-medium text-gray-500">USDC</span>
                </p>
                <p className="mt-1 text-sm text-gray-500">Stellar Mainnet</p>
                <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Settlement</span>
                    <span className="font-medium text-gray-900 dark:text-white">4.2 seconds</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-500">Network fee</span>
                    <span className="font-medium text-gray-900 dark:text-white">0.00001 XLM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <section className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 px-8 py-14 text-center shadow-xl sm:px-12">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to start invoicing?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-blue-100">
              Connect your wallet and create your first invoice in under a minute.
              No credit card, no lengthy sign-up.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                Sign In with Freighter <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/invoices/new"
                className="inline-flex items-center gap-2 rounded-md border border-blue-400 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Create an Invoice
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Invoisio. Built on Stellar.
          </p>
          <nav className="flex gap-6">
            <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Invoices
            </Link>
            <Link href="/pos" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Point of Sale
            </Link>
            <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Settings
            </Link>
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Sign In
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
