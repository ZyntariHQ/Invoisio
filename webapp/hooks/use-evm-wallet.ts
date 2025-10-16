"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

declare global {
  interface Window {
    ethereum?: any
  }
}

type WalletState = {
  isConnected: boolean
  address: string | null
}

export function useEvmWallet() {
  const [state, setState] = useState<WalletState>({ isConnected: false, address: null })

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("evm_wallet_address") : null
    if (saved) {
      setState({ isConnected: true, address: saved })
    }

    const tryAccounts = async () => {
      try {
        const eth = window.ethereum
        if (!eth) return
        const accounts: string[] = await eth.request({ method: 'eth_accounts' })
        if (accounts && accounts[0]) {
          window.localStorage.setItem("evm_wallet_address", accounts[0])
          setState({ isConnected: true, address: accounts[0] })
        }
      } catch {
        // silent
      }
    }
    tryAccounts()
  }, [])

  const connect = useCallback(async () => {
    try {
      const eth = window.ethereum
      if (!eth) {
        console.warn("No EVM wallet detected. Install MetaMask/Coinbase/Trust Wallet.")
        return
      }
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      const addr = accounts?.[0]
      if (!addr) {
        throw new Error("Failed to retrieve wallet address")
      }
      window.localStorage.setItem("evm_wallet_address", addr)
      setState({ isConnected: true, address: addr })
    } catch (err) {
      console.error("EVM connect error:", err)
    }
  }, [])

  const disconnect = useCallback(() => {
    try {
      window.localStorage.removeItem("evm_wallet_address")
      setState({ isConnected: false, address: null })
    } catch {
      // no-op
    }
  }, [])

  const displayAddress = useMemo(() => {
    if (!state.address) return null
    const a = state.address
    if (a.length <= 12) return a
    return `${a.slice(0, 6)}…${a.slice(-4)}`
  }, [state.address])

  return {
    isConnected: state.isConnected,
    address: state.address,
    displayAddress,
    connect,
    disconnect,
  }
}