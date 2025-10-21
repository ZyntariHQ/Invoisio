import { useCallback, useEffect, useState } from 'react'

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
    const stored = window.localStorage.getItem('evm_wallet_address')
    if (stored) {
      setGlobalEvmWalletState({ address: stored, connected: true })
    }
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

      window.localStorage.setItem('evm_wallet_address', addr)
      setGlobalEvmWalletState({ address: addr, connected: true })

      // Wallet-as-login: SIWE handshake with backend
      try {
        const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001').replace(/\/$/, '')
        const nonceRes = await fetch(`${API_BASE}/api/auth/wallet/nonce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: addr }),
        })
        if (nonceRes.ok) {
          const { nonce, chainId, domain } = await nonceRes.json()
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
          const sig = await eth.request({ method: 'personal_sign', params: [msg, addr] })
          const connectRes = await fetch(`${API_BASE}/api/auth/wallet/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: addr, signature: sig, message: msg }),
          })
          if (connectRes.ok) {
            const json = await connectRes.json()
            if (json?.token) {
              window.localStorage.setItem('evm_auth_token', json.token)
            }
          }
        }
      } catch (e: any) {
        console.warn('Wallet login handshake failed:', e?.message || e)
      }

      return addr
    } catch (err) {
      console.error('Failed to connect EVM wallet:', err)
      return null
    }
  }, [])

  const disconnect = useCallback(async () => {
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