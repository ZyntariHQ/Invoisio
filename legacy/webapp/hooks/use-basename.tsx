'use client'

import React, { createContext, useContext, useMemo } from 'react'
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi'
import { base } from 'wagmi/chains'
import { displayName as formatDisplay, truncateAddress } from '@/utils/basename'
import { BASENAME_RESOLVER } from '@/lib/basename'

export type BasenameState = {
  address: `0x${string}` | null
  name: string | null
  avatarUrl: string | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

const BasenameContext = createContext<BasenameState | null>(null)

export function useBasename(addressOverride?: `0x${string}` | null): BasenameState {
  const { address } = useAccount()
  const activeAddress = addressOverride ?? (address as `0x${string}` | undefined) ?? null

  // Reverse lookup: address -> ENS/Basename on Base
  const ensName = useEnsName({ address: activeAddress ?? undefined, chainId: base.id, scopeKey: 'basename', universalResolverAddress: BASENAME_RESOLVER })

  // Avatar requires a name; request only when name is available
  const ensAvatar = useEnsAvatar({ name: (ensName.data ?? undefined) as string | undefined, chainId: base.id, scopeKey: 'basename-avatar', universalResolverAddress: BASENAME_RESOLVER })

  const loading = Boolean(ensName.isLoading || ensAvatar.isLoading)
  const error = (ensName.error as Error) || (ensAvatar.error as Error) || null

  const name = (ensName.data || null) as string | null
  const avatarUrl = (ensAvatar.data || null) as string | null

  return {
    address: activeAddress,
    name,
    avatarUrl,
    loading,
    error,
    refetch: () => {
      ensName.refetch?.()
      ensAvatar.refetch?.()
    },
  }
}

export function BasenameProvider({ children }: { children: React.ReactNode }) {
  const state = useBasename()

  const value = useMemo<BasenameState>(() => ({
    address: state.address,
    name: state.name,
    avatarUrl: state.avatarUrl,
    loading: state.loading,
    error: state.error,
    refetch: state.refetch,
  }), [state.address, state.name, state.avatarUrl, state.loading, state.error])

  return (
    <BasenameContext.Provider value={value}>{children}</BasenameContext.Provider>
  )
}

export function useBasenameContext(): BasenameState {
  const ctx = useContext(BasenameContext)
  if (!ctx) {
    // Provide a safe fallback to avoid crashing if used outside the provider
    return {
      address: null,
      name: null,
      avatarUrl: null,
      loading: false,
      error: null,
      refetch: () => {},
    }
  }
  return ctx
}

export function useBasenameDisplay(addressOverride?: `0x${string}` | null): { display: string; loading: boolean } {
  const state = useBasename(addressOverride)
  const display = formatDisplay(state.name, state.address ?? null) || truncateAddress(state.address)
  return { display, loading: state.loading }
}