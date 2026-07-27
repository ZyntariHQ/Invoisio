import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">Invoisio</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 font-medium">Stellar</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/invoices" className="hover:text-blue-600 transition-colors">Invoices</Link>
            <Link href="/pos" className="hover:text-blue-600 transition-colors">Point of Sale</Link>
            <Link href="/login" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors">Connect Wallet</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
            Smart Invoicing & Crypto Payments on Stellar
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Issue, manage, and settle invoices effortlessly using XLM and USDC with low fees and instant SEP-0007 wallet payments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg mb-4">
                📄
              </div>
              <h2 className="text-xl font-bold mb-2">Invoice Dashboard</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Track pending, paid, and overdue invoices with real-time status polling and filtering.
              </p>
            </div>
            <Link href="/invoices" className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700">
              View Invoices &rarr;
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg mb-4">
                ⚡
              </div>
              <h2 className="text-xl font-bold mb-2">Point of Sale</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Generate instant QR codes for walk-in payments in XLM or USDC right at your counter.
              </p>
            </div>
            <Link href="/pos" className="inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700">
              Launch POS &rarr;
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg mb-4">
                🔐
              </div>
              <h2 className="text-xl font-bold mb-2">Freighter Sign-In</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Sign challenges securely with Freighter extension to verify merchant identity and access protected API routes.
              </p>
            </div>
            <Link href="/login" className="inline-flex items-center text-sm font-semibold text-purple-600 hover:text-purple-700">
              Sign In with Wallet &rarr;
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
