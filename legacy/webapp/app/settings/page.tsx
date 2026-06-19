"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEvmWallet } from "@/hooks/use-evm-wallet"
import { useAuthStore } from "@/hooks/use-auth-store"
import { ShieldCheck, LogOut, Wallet, ArrowRight } from "lucide-react"

export default function SettingsPage() {
  const { address, connected, displayAddress, disconnect } = useEvmWallet()
  const { user } = useAuthStore()

  return (
    <div className="space-y-6 pb-8">
      <Card className="border-border bg-background shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Settings
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Wallet access and dashboard preferences for the deployed legacy app.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Wallet</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {connected ? displayAddress : "Not connected"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {address ? "Connected via your EVM wallet" : "Connect a wallet to authenticate"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Session</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {user?.walletAddress || "No active session"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Session data is stored locally for the legacy frontend.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-background shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-primary" />
            Quick Actions
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Jump to common merchant tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/invoices">
              <ArrowRight className="mr-2 h-4 w-4" />
              View Invoices
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void disconnect()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
