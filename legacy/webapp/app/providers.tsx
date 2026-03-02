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
    try {
      const boot = document.getElementById('nm-boot-loader')
      if (boot) boot.remove()
    } catch {}

    // Suppress Coinbase analytics network calls to avoid CORS errors during local dev
    let originalFetch: any
    let originalSendBeacon: any
    try {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        originalFetch = window.fetch.bind(window)
        window.fetch = (input: any, init?: any) => {
          const url = typeof input === 'string' ? input : (input?.url ?? '')
          const blocked = ['api.developer.coinbase.com/analytics', 'cca-lite.coinbase.com/amp']
          if (typeof url === 'string' && blocked.some(b => url.includes(b))) {
            return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }))
          }
          return originalFetch(input, init)
        }
      }
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        originalSendBeacon = navigator.sendBeacon.bind(navigator)
        navigator.sendBeacon = (url: any, data?: any) => {
          const blocked = ['api.developer.coinbase.com/analytics', 'cca-lite.coinbase.com/amp']
          if (typeof url === 'string' && blocked.some(b => url.includes(b))) {
            return true
          }
          return originalSendBeacon(url, data)
        }
      }
    } catch {}

    const t = setTimeout(() => setReady(true), 300)
    return () => {
      clearTimeout(t)
      try {
        if (originalFetch) window.fetch = originalFetch
        if (originalSendBeacon) navigator.sendBeacon = originalSendBeacon
      } catch {}
    }
  }, [])

  // Ensure apiKey is a safe string to avoid runtime errors in provider
  const okApiKey = typeof process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY === 'string' ? process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY : ''

  // Disable OnchainKit telemetry/analytics to avoid CORS noise during local dev
  const okConfig = { analytics: false } as const

  return (
    <WagmiProvider config={wagmiConfig}>
      <OnchainKitProvider chain={base} apiKey={okApiKey} config={okConfig}>
        <LoaderProvider>
          {ready ? children : <Loader fullscreen />}
        </LoaderProvider>
      </OnchainKitProvider>
    </WagmiProvider>
  );
}