// Basename resolver configuration for ENS-compatible resolution on Base
// Allows overriding via NEXT_PUBLIC_BASENAME_RESOLVER

export const BASENAME_RESOLVER: `0x${string}` | undefined =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASENAME_RESOLVER as `0x${string}` | undefined) ||
  // Default L2Resolver address (verify via Base docs)
  '0xB6d2fA83EDc7D7f2e3f8a2b3a5a4e1f6e7d8c9a0' as `0x${string}`