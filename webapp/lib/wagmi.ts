import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from '@wagmi/connectors';






export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: 'Invoisio',
      preference: 'smartWalletOnly',
      version: '4',
    }),
    // MetaMask intentionally omitted to prevent SSR crashes with SDK
  ],
  // Disable SSR to avoid useConfig context mismatches during server render
  ssr: false,
  multiInjectedProviderDiscovery: false,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});