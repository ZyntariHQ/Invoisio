"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ReactNode } from "react"
import { FileText, PieChart, Settings } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { WalletHeader } from "@/components/wallet-header"
import { cn } from "@/lib/utils"
import { useEvmWallet } from "@/hooks/use-evm-wallet"

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    description: "Overview and wallet health",
    icon: PieChart,
  },
  {
    label: "Invoices",
    href: "/invoices",
    description: "Create and manage invoices",
    icon: FileText,
  },
  {
    label: "Settings",
    href: "/settings",
    description: "Wallet and merchant preferences",
    icon: Settings,
  },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface MerchantDashboardShellProps {
  children: ReactNode
  title: string
  description: string
}

export function MerchantDashboardShell({ children, title, description }: MerchantDashboardShellProps) {
  const pathname = usePathname()
  const { address, connected, displayAddress } = useEvmWallet()

  return (
    <div className="min-h-screen bg-[var(--nm-background)] text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r border-border bg-background/95 backdrop-blur md:flex">
        <div className="border-b border-border px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Invoisio
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Merchant Workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invoices, wallet health, and merchant settings.
          </p>
        </div>

        <nav className="space-y-2 px-4 py-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-transparent bg-muted/40 text-foreground hover:border-border hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className={cn("text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {item.description}
                  </div>
                </div>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-border p-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Wallet</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {connected ? displayAddress : "Wallet not connected"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {address ? "Session loaded from your wallet" : "Connect to see account details"}
            </p>
          </div>
          <div className="mt-4">
            <WalletHeader />
          </div>
        </div>
      </aside>

      <div className="md:pl-72">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Merchant Dashboard
                </p>
                <h1 className="truncate text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>

              <div className="flex items-center gap-3">
                <ThemeToggle />
                <WalletHeader />
              </div>
            </div>

            <nav className="grid grid-cols-3 gap-2 md:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isActive(pathname, item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-3 text-center transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
