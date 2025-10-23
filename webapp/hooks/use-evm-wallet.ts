import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'

export type EvmWalletState = {
  address: string | null
  connected: boolean
}

// Global store to share wallet state across all hook instances
let globalEvmWalletState: EvmWalletState = { address: null, connected: false }
const subscribers = new Set<(s: EvmWalletState) => void>()
const setGlobalEvmWalletState = (next: EvmWalletState) => {
  globalEvmWalletState = next
  subscribers.forEach((fn) => fn(globalEvmWalletState))
}

export function useEvmWallet() {
  const [evmWallet, setEvmWallet] = useState<EvmWalletState>(globalEvmWalletState)

  // Subscribe to global state changes so all components stay in sync
  useEffect(() => {
    const sub = (s: EvmWalletState) => setEvmWallet(s)
    subscribers.add(sub)
    return () => {
      subscribers.delete(sub)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const addr = window.localStorage.getItem('evm_wallet_address')
    const token = window.localStorage.getItem('evm_auth_token')
    if (addr) {
      // Only consider connected when a valid auth token exists
      setGlobalEvmWalletState({ address: addr, connected: Boolean(token) })
    }
  }, [])

  // Reflect server-side session state on load
  useEffect(() => {
    let cancelled = false
    const checkStatus = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.localStorage.getItem('evm_auth_token') : null
        // Only call status when we actually have an auth token
        if (!token) {
          return
        }
        const status = await api.auth.wallet.status()
        const addr = (status as any)?.walletAddress || (typeof window !== 'undefined' ? window.localStorage.getItem('evm_wallet_address') : null)
        const connected = Boolean((status as any)?.connected ?? addr)
        if (!cancelled) {
          if (connected && addr) {
            if ((status as any)?.token && typeof window !== 'undefined') {
              window.localStorage.setItem('evm_auth_token', (status as any).token)
            }
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('evm_wallet_address', addr)
            }
            setGlobalEvmWalletState({ address: addr, connected: true })
          } else {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('evm_wallet_address')
              window.localStorage.removeItem('evm_auth_token')
            }
            setGlobalEvmWalletState({ address: null, connected: false })
          }
        }
      } catch (e) {
        // Leave client state as-is on failure
      }
    }
    checkStatus()
    return () => { cancelled = true }
  }, [])

  const connect = useCallback(async () => {
    try {
      if (!(window as any).ethereum) {
        throw new Error('No EVM wallet provider found')
      }
      const eth = (window as any).ethereum

      // Request accounts
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      const addr = accounts?.[0]
      if (!addr) throw new Error('No account returned from provider')

      // Ensure Base Sepolia network (chainId 84532)
      const targetChainIdHex = '0x14A34' // 84532
      const currentChainIdHex: string = await eth.request({ method: 'eth_chainId' })
      if (currentChainIdHex?.toLowerCase() !== targetChainIdHex.toLowerCase()) {
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainIdHex }],
          })
        } catch (switchErr: any) {
          // If chain is not added, add Base Sepolia then switch
          if (switchErr?.code === 4902 || /not added/i.test(String(switchErr?.message))) {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: targetChainIdHex,
                  chainName: 'Base Sepolia',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://sepolia.base.org'],
                  blockExplorerUrls: ['https://sepolia.basescan.org'],
                },
              ],
            })
            await eth.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: targetChainIdHex }],
            })
          } else {
            console.warn('Chain switch failed:', switchErr)
          }
        }
      }

      // Persist address but do not mark as connected until auth succeeds
      window.localStorage.setItem('evm_wallet_address', addr)
      setGlobalEvmWalletState({ address: addr, connected: false })

      // Wallet-as-login: SIWE handshake with backend
      try {
        const { nonce, chainId, domain } = await api.auth.wallet.nonce(addr)
        const issuedAt = new Date().toISOString()
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
        const d = domain || new URL(origin).hostname
        const msg =
          `${d} wants you to sign in with your Ethereum account:\n${addr}\n\n` +
          `URI: ${origin}\n` +
          `Version: 1\n` +
          `Chain ID: ${chainId ?? 84532}\n` +
          `Nonce: ${nonce}\n` +
          `Issued At: ${issuedAt}`

        // Try multiple signing parameter orders for broad wallet compatibility
        const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('')
        let sig: string | undefined
        try {
          sig = await eth.request({ method: 'personal_sign', params: [msg, addr] })
        } catch (e1: any) {
          try {
            sig = await eth.request({ method: 'personal_sign', params: [addr, msg] })
          } catch (e2: any) {
            try {
              sig = await eth.request({ method: 'personal_sign', params: [toHex(msg), addr] })
            } catch (e3: any) {
              try {
                sig = await eth.request({ method: 'eth_sign', params: [addr, toHex(msg)] })
              } catch (e4: any) {
                console.warn('Signing failed using multiple methods:', e1?.message || e1, e2?.message || e2, e3?.message || e3, e4?.message || e4)
                throw e4 || e3 || e2 || e1
              }
            }
          }
        }
        if (!sig) throw new Error('Signature not obtained')

        const connectRes = await api.auth.wallet.connect({ walletAddress: addr, signature: sig, message: msg })
        if (connectRes?.token) {
          window.localStorage.setItem('evm_auth_token', connectRes.token)
          // Verify token works against a guarded endpoint
          try {
            const st = await api.auth.wallet.status()
            if (st && st.connected) {
              setGlobalEvmWalletState({ address: addr, connected: true })
              return addr
            } else {
              // Guard rejected: clear token and treat as not connected
              window.localStorage.removeItem('evm_auth_token')
              setGlobalEvmWalletState({ address: addr, connected: false })
              throw new Error('Authentication failed: status check not connected')
            }
          } catch (e) {
            window.localStorage.removeItem('evm_auth_token')
            setGlobalEvmWalletState({ address: addr, connected: false })
            throw e
          }
        } else {
          // No token returned -> treat as not connected for app features
          window.localStorage.removeItem('evm_auth_token')
          setGlobalEvmWalletState({ address: addr, connected: false })
          throw new Error('Authentication token not issued')
        }
      } catch (e: any) {
        console.warn('Wallet login handshake failed:', e?.message || e)
        window.localStorage.removeItem('evm_auth_token')
        setGlobalEvmWalletState({ address: addr, connected: false })
        throw e
      }
    } catch (err) {
      console.error('Failed to connect EVM wallet:', err)
      return null
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      const addr = globalEvmWalletState.address
      if (addr) {
        await api.auth.wallet.disconnect(addr)
      }
    } catch (e) {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('evm_wallet_address')
      window.localStorage.removeItem('evm_auth_token')
    }
    setGlobalEvmWalletState({ address: null, connected: false })
  }, [])

  const isConnected = evmWallet.connected
  const address = evmWallet.address
  const displayAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

  return {
    evmWallet,
    connect,
    disconnect,
    isConnected,
    address,
    displayAddress,
  }
}