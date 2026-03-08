'use client';

import { useEffect } from 'react';
import { useWalletAuth } from '@/hooks/use-wallet-auth';

function getChipClasses(status: 'disconnected' | 'connected' | 'signed-in'): string {
  if (status === 'signed-in') {
    return 'bg-green-100 text-green-800 border-green-200';
  }

  if (status === 'connected') {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  }

  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function getStatusLabel(status: 'disconnected' | 'connected' | 'signed-in'): string {
  if (status === 'signed-in') {
    return 'Signed In';
  }

  if (status === 'connected') {
    return 'Connected';
  }

  return 'Disconnected';
}

export function WalletAuthControls() {
  const {
    status,
    publicKey,
    isFreighterReady,
    isLoading,
    message,
    error,
    connectWallet,
    signIn,
    signOut,
    clearMessage,
  } = useWalletAuth();

  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearMessage();
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message, error, clearMessage]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Wallet Status
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getChipClasses(status)}`}
            >
              {getStatusLabel(status)}
            </span>
            {publicKey && (
              <span className="text-xs text-gray-500">
                {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {status === 'disconnected' && (
            <button
              onClick={() => {
                void connectWallet().catch(() => undefined);
              }}
              disabled={isLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}

          {status === 'connected' && (
            <button
              onClick={() => {
                void signIn().catch(() => undefined);
              }}
              disabled={isLoading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isLoading ? 'Signing...' : 'Sign Challenge'}
            </button>
          )}

          {status === 'signed-in' && (
            <button
              onClick={signOut}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {!isFreighterReady && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Freighter extension not detected. Install Freighter to connect your Stellar wallet.
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-900">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
