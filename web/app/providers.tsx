
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { WalletAuthProvider } from '@/hooks/use-wallet-auth';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WalletAuthProvider>{children}</WalletAuthProvider>
    </QueryClientProvider>
  );
}
