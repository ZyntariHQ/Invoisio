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
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <DashboardContent />
      </div>
    </RequireAuth>
  );
}
