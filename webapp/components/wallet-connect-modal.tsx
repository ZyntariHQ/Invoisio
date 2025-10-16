"use client"

import * as Dialog from "@radix-ui/react-dialog"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type WalletKey = "metamask" | "coinbase"

type WalletConnectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: () => Promise<void>
}

export function WalletConnectModal({ open, onOpenChange, onConnect }: WalletConnectModalProps) {
  const { toast } = useToast()

  const selectWallet = async (key: WalletKey) => {
    try {
      const eth = (window as any).ethereum
      let provider = eth

      if (eth?.providers?.length) {
        if (key === "metamask") provider = eth.providers.find((p: any) => p.isMetaMask)
        if (key === "coinbase") provider = eth.providers.find((p: any) => p.isCoinbaseWallet)
      } else if (eth) {
        const matches = {
          metamask: !!eth.isMetaMask,
          coinbase: !!eth.isCoinbaseWallet,
        }
        if (!matches[key]) provider = undefined
      }

      if (!provider) {
        const installUrl = key === "metamask"
          ? "https://metamask.io/download/"
          : "https://www.coinbase.com/wallet/downloads"
        window.open(installUrl, "_blank")
        return
      }

      ;(window as any).ethereum = provider
      await onConnect()
      onOpenChange(false)
      toast({ title: "Wallet Connected", description: "You are ready to transact." })
    } catch (err: any) {
      console.error("Wallet select error:", err)
      toast({ title: "Connection Failed", description: err?.message || "Unable to connect", variant: "destructive" })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md nm-flat rounded-xl p-6 border border-border">
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

          <Dialog.Close asChild>
            <Button variant="outline" className="mt-4 w-full">Close</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}