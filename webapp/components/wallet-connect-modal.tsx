"use client"

import * as Dialog from "@radix-ui/react-dialog"
import Image from "next/image"
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useConnect, useDisconnect, useAccount } from "wagmi"
import { useAuthStore } from "@/hooks/use-auth-store";

type WalletKey = "metamask" | "coinbase"

type WalletConnectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletConnectModal({ open, onOpenChange }: WalletConnectModalProps) {
  const { toast } = useToast()
  const { isConnected, address } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const selectWallet = async (key: WalletKey) => {
    try {
      const targetId = key === "metamask" ? "metaMask" : "coinbaseWallet"
      const connector = connectors.find((c) => c.id === targetId)
      if (!connector) {
        const installUrl = key === "metamask"
          ? "https://metamask.io/download/"
          : "https://www.coinbase.com/wallet/downloads"
        window.open(installUrl, "_blank")
        return
      }
      const result = await connectAsync({ connector })
      onOpenChange(false)
      const addr = (result as any)?.accounts?.[0] || address || ""
      toast({
        title: "Wallet connected successfully",
        description: addr ? `Connected to ${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connected",
        progress: 100,
      })
    } catch (err: any) {
      console.error("Wallet connect error:", err)
      toast({ title: "Connection Failed", description: err?.message || "Unable to connect", variant: "destructive" })
    }
  }

  const { login, logout, checkAuth, user } = useAuthStore();

  
  useEffect(() => {
    if(isConnected) {
      login(address as string);
      checkAuth();
    } else {
      logout();
    }
  },[isConnected, address, login, logout, checkAuth])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100000] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-[100010] flex items-center justify-center p-4">
          <div className="w-[92vw] max-w-md nm-flat rounded-xl p-6 border border-border">
          <div className="flex items-center space-x-2 mb-4">
            <Wallet className="h-5 w-5 text-primary" />
            <Dialog.Title className="font-semibold">Select a Wallet</Dialog.Title>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Choose an EVM wallet to connect.</p>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => selectWallet("metamask")} className="nm-convex rounded-lg p-4 hover:bg-muted/50 flex flex-col items-center">
              <Image src="/wallets/metamask.svg" alt="MetaMask" width={48} height={48} />
              <span className="mt-2 text-sm">MetaMask</span>
            </button>
            <button onClick={() => selectWallet("coinbase")} className="nm-convex rounded-lg p-4 hover:bg-muted/50 flex flex-col items-center">
              <Image src="/wallets/coinbase.svg" alt="Coinbase Wallet" width={48} height={48} />
              <span className="mt-2 text-sm">Coinbase</span>
            </button>
          </div>

          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">Don’t have a wallet? We’ll open the install page.</p>

          {isConnected && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={async () => {
                await disconnect()
                toast({ title: "Wallet disconnected", description: "You are now disconnected.", progress: 100 })
                onOpenChange(false)
              }}
            >
              Disconnect Wallet
            </Button>
          )}

          <Dialog.Close asChild>
            <Button variant="outline" className="mt-4 w-full">Close</Button>
          </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}