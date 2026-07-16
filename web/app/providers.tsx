
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { WalletAuthProvider } from '@/hooks/use-wallet-auth';
import { ErrorBoundaryWithReporting } from '@/components/error-boundary';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WalletAuthProvider>
        <ErrorBoundaryWithReporting>{children}</ErrorBoundaryWithReporting>
      </WalletAuthProvider>
    </QueryClientProvider>
  );
}
