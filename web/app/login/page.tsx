
'use client';

import Link from 'next/link';
import { WalletAuthControls } from '@/components/wallet-auth-controls';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Wallet Sign-In</h1>
          <p className="mt-2 text-gray-600">
            Connect Freighter, sign your challenge, and get a JWT for protected API calls.
          </p>
        </div>

        <WalletAuthControls />

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          <p className="font-medium text-gray-900">How it works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Connect your Freighter wallet.</li>
            <li>Sign the backend challenge.</li>
            <li>Receive a JWT and access protected routes.</li>
          </ol>
        </div>

        <div className="mt-6">
          <Link href="/invoices" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Go to invoices
          </Link>
        </div>
      </div>
    </div>
  );
}