"use client";

import { ReactNode, useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import LoaderProvider from '@/components/loader-provider';
import Loader from '@/components/loader';

export default function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Remove SSR boot overlay once app mounts
    const boot = document.getElementById('nm-boot-loader')
    if (boot) boot.remove()
    const t = setTimeout(() => setReady(true), 3000)
    return () => clearTimeout(t)
  }, [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <OnchainKitProvider chain={base} apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}>
        <LoaderProvider>
          {ready ? children : <Loader fullscreen />}
        </LoaderProvider>
      </OnchainKitProvider>
    </WagmiProvider>
  );
}