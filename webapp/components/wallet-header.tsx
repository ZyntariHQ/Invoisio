"use client"

import { Wallet as OnchainWallet, ConnectWallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet"
import { Avatar, Name, Address, Identity } from "@coinbase/onchainkit/identity"
import { useAccount } from "wagmi"

export function WalletHeader() {
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount()

  return (
    <OnchainWallet>
      <ConnectWallet
        disconnectedLabel={isWagmiConnected && wagmiAddress ? `${wagmiAddress.slice(0, 6)}…${wagmiAddress.slice(-4)}` : "Connect"}
        className="nm-convex rounded-full h-9 px-4 bg-[var(--nm-background)] text-black dark:!text-white hover:bg-[var(--nm-background)] hover:text-black dark:hover:!text-white flex items-center"
      >
        <Avatar className="h-5 w-5" />
        <Name className="ml-2 text-black dark:!text-white" />
      </ConnectWallet>
      <WalletDropdown>
        <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
          <Avatar />
          <Name />
          <Address />
        </Identity>
        <WalletDropdownDisconnect />
      </WalletDropdown>
    </OnchainWallet>
  )
}