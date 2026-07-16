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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-100">
      {/* Hero */}
      <header className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <SectionBadge>Privacy-first invoicing on Stellar</SectionBadge>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Get paid in crypto, the easy way
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
            Invoisio turns your Stellar wallet into a full invoicing desk. Create
            invoices, share QR codes, and watch payments settle on-chain in seconds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaButton href="/login">
              Get started <ArrowRight className="h-4 w-4" />
            </CtaButton>
            <CtaButton href="/invoices" variant="secondary">
              View invoices
            </CtaButton>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {s.value}
                </p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold">Everything you need to get paid</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-gray-200 p-6 shadow-sm dark:border-gray-800"
            >
              <f.icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((w) => (
            <div key={w.step} className="rounded-xl border border-gray-200 p-6 dark:border-gray-800">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {w.step}
              </span>
              <w.icon className="mt-3 h-7 w-7 text-gray-700 dark:text-gray-200" />
              <h3 className="mt-3 text-base font-semibold">{w.title}</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{w.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-blue-600 px-8 py-12 text-center text-white">
          <h2 className="text-3xl font-bold">Ready to send your first invoice?</h2>
          <p className="mt-3 text-blue-100">
            Connect your wallet and start accepting Stellar payments in minutes.
          </p>
          <div className="mt-6 flex justify-center">
            <CtaButton href="/login" variant="secondary">
              Launch app <Zap className="h-4 w-4" />
            </CtaButton>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
        Built for freelancers on Stellar.{' '}
        <Link href="/invoices" className="underline">
          Go to dashboard
        </Link>
      </footer>
    </div>
  );
}
