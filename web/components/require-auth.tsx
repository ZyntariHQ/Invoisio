'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletAuth } from '@/hooks/use-wallet-auth';

interface RequireAuthProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function RequireAuth({ children, redirectTo = '/login' }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useWalletAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--color-bg-primary)' }}
      >
        <div className="flex flex-col items-center gap-6">
          {/* Branded shimmer skeleton mimicking sidebar + header */}
          <div className="flex w-[340px] flex-col gap-4 sm:w-[480px]">
            {/* Fake header bar */}
            <div
              className="animate-shimmer h-4 w-32 rounded-full"
              style={{ animationDelay: '0s' }}
            />
            <div
              className="animate-shimmer h-8 w-48 rounded-lg"
              style={{ animationDelay: '0.1s' }}
            />

            {/* Fake content cards */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div
                className="animate-shimmer h-20 rounded-xl"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="animate-shimmer h-20 rounded-xl"
                style={{ animationDelay: '0.3s' }}
              />
            </div>
            <div
              className="animate-shimmer h-32 rounded-xl"
              style={{ animationDelay: '0.4s' }}
            />
          </div>

          <p
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Verifying wallet session…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
