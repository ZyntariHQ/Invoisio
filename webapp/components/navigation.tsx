"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FileText, BarChart3, PieChart, Bell, Wallet as WalletIcon, Menu, X, Home } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState, useEffect } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAccount, useDisconnect } from "wagmi"
import dynamic from "next/dynamic"
import { Wallet as OnchainWallet, ConnectWallet } from "@coinbase/onchainkit/wallet"
import { Avatar } from "@coinbase/onchainkit/identity"
import { useAppLoader } from "@/components/loader-provider"

const navigation = []
const WalletHeader = dynamic(() => import("@/components/wallet-header").then(m => m.WalletHeader), { ssr: false })

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { withLoader } = useAppLoader()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const { address: wagmiAddress, isConnected: wagmiIsConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const isMobile = useIsMobile()

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY
      setIsScrolled(scrollPosition > 50)
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.notification-dropdown')) {
        setIsNotificationOpen(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (isMobile && wagmiIsConnected) {
      setIsMenuOpen(false)
    }
  }, [isMobile, wagmiIsConnected])

  const goToPayment = async () => {
    await withLoader(async () => {
      router.push("/payment")
      await new Promise((res) => setTimeout(res, 250))
    })
  }

  const goToCreate = async () => {
    await withLoader(async () => {
      router.push("/create")
      await new Promise((res) => setTimeout(res, 250))
    })
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 py-2" style={{ borderRadius: '0', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', background: 'var(--background)', borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="relative flex items-center justify-center h-14 w-14 overflow-hidden">
                <Image 
                  src="/assest/invoisio_logo.svg" 
                  alt="Invoisio Logo" 
                  width={56} 
                  height={56} 
                  className="object-contain" 
                  priority
                />
              </div>
              <span className={cn(
                 "font-poppins font-bold text-xl text-foreground transition-all duration-500 ease-in-out transform",
                 isScrolled 
                   ? "opacity-0 scale-95 translate-x-2 w-0 overflow-hidden ml-0" 
                   : "opacity-100 scale-100 translate-x-0 ml-2"
               )}>Invoisio</span>
            </Link>
          </div>

          <div className={cn("items-center space-x-8", !isMobile ? "flex" : "hidden")}>
            {/* Navigation links removed */}
          </div>

          {/* Desktop Navigation */}
          <div className={cn("nm-flat rounded-lg p-2 items-center space-x-3", !isMobile ? "flex" : "hidden")}>
            <div className="relative notification-dropdown">
              <Button
                variant="neumorphic"
                size="icon"
                className="w-9 h-9 rounded-full nm-convex text-muted-foreground hover:text-primary relative"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs flex items-center justify-center text-white"></span>
              </Button>
              {isNotificationOpen && (
                <div className="absolute right-0 top-12 w-80 bg-background border border-border rounded-lg shadow-lg z-50 nm-flat">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {/* Sample Notifications */}
                    <div className="p-4 border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Invoice #INV-001 has been paid</p>
                          <p className="text-xs text-muted-foreground mt-1">2 minutes ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">New client registration</p>
                          <p className="text-xs text-muted-foreground mt-1">1 hour ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Invoice #INV-002 is overdue</p>
                          <p className="text-xs text-muted-foreground mt-1">3 hours ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">System maintenance scheduled</p>
                          <p className="text-xs text-muted-foreground mt-1">1 day ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border-t border-border">
                    <button className="text-sm text-primary hover:text-primary/80 font-medium w-full text-center">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Home icon */}
            {pathname !== "/" && (
              <Button
                 variant="neumorphic"
                 size="icon"
                 className={cn(
                    "w-9 h-9 rounded-full nm-convex",
                    pathname === "/"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                 asChild
              >
                <Link href="/">
                  <Home className="h-5 w-5" />
                </Link>
              </Button>
            )}

            {pathname !== "/dashboard" && (
              <Button
                variant="neumorphic"
                size="icon"
                className={cn(
                  "w-9 h-9 rounded-full nm-convex",
                  pathname === "/dashboard"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
                asChild
              >
                <Link href="/dashboard">
                  <PieChart className="h-5 w-5" />
                </Link>
              </Button>
            )}
            {/* Route-specific quick nav icons */}
            {pathname === "/dashboard" && (
              <>
                <Button
                  variant="neumorphic"
                  size="icon"
                  className={cn("w-9 h-9 rounded-full nm-convex", "text-muted-foreground")}
                  asChild
                >
                  <Link href="/payment" onClick={(e) => { e.preventDefault(); goToPayment(); }}>
                    <WalletIcon className="h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="neumorphic"
                  size="icon"
                  className={cn("w-9 h-9 rounded-full nm-convex", "text-muted-foreground")}
                  asChild
                >
                  <Link href="/create" onClick={(e) => { e.preventDefault(); goToCreate(); }}>
                    <FileText className="h-5 w-5" />
                  </Link>
                </Button>
              </>
            )}
            {pathname?.startsWith("/create") && (
              <Button
                variant="neumorphic"
                size="icon"
                className={cn("w-9 h-9 rounded-full nm-convex", "text-muted-foreground")}
                asChild
              >
                <Link href="/payment" onClick={(e) => { e.preventDefault(); goToPayment(); }}>
                  <WalletIcon className="h-5 w-5" />
                </Link>
              </Button>
            )}
            {pathname?.startsWith("/payment") && (
              <Button
                variant="neumorphic"
                size="icon"
                className={cn("w-9 h-9 rounded-full nm-convex", "text-muted-foreground")}
                asChild
              >
                <Link href="/create" onClick={(e) => { e.preventDefault(); goToCreate(); }}>
                  <FileText className="h-5 w-5" />
                </Link>
              </Button>
            )}
            <ThemeToggle />
            {/* Wallet header (client-only, dynamic) */}
            <WalletHeader />
          </div>

          {/* Mobile Navigation */}
          <div className={cn("items-center space-x-2", isMobile ? "flex" : "hidden")}>
            <ThemeToggle />
            <div className="relative notification-dropdown">
              {/* ... existing bell button and dropdown ... */}
            </div>
            <Button
               variant="neumorphic"
               size="icon"
               className="nm-convex rounded-full"
               onClick={() => setIsMenuOpen(!isMenuOpen)}
             >
               {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
             </Button>
          </div>
        </div>

        {/* Mobile Menu */}
         {isMobile && isMenuOpen && (
         <div className="mt-4 nm-flat rounded-lg p-4 space-y-3">
            {/* Home */}
            {pathname !== "/" && (
            <Button
              variant="neumorphic"
              size="sm"
              className={cn(
                 "w-full justify-start nm-convex rounded-lg",
                 pathname === "/"
                   ? "bg-primary text-primary-foreground"
                   : "text-muted-foreground"
                 )}
                asChild
                onClick={() => setIsMenuOpen(false)}
              >
                <Link href="/" className="flex items-center space-x-2">
                  <Home className="h-5 w-5" />
                  <span>Home</span>
                </Link>
              </Button>
            )}
            {/* Dashboard */}
            {pathname !== "/dashboard" && (
            <Button
              variant="neumorphic"
              size="sm"
              className={cn(
                 "w-full justify-start nm-convex rounded-lg",
                 pathname === "/dashboard"
                   ? "bg-primary text-primary-foreground"
                   : "text-muted-foreground"
                 )}
                asChild
                onClick={() => setIsMenuOpen(false)}
              >
                <Link href="/dashboard" className="flex items-center space-x-2">
                  <PieChart className="h-5 w-5" />
                  <span>Dashboard</span>
                </Link>
              </Button>
            )}
              {/* Route-specific quick nav in mobile menu */}
              {pathname?.startsWith("/create") && (
                <Button
                  variant="neumorphic"
                  size="sm"
                  className={cn(
                    "w-full justify-start nm-convex rounded-lg",
                    "text-muted-foreground"
                  )}
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                  style={{ background: "var(--nm-background)" }}
               >
                  <Link href="/payment" onClick={(e) => { e.preventDefault(); goToPayment(); }} className="flex items-center space-x-2">
                    <WalletIcon className="h-5 w-5" />
                    <span>Payment</span>
                  </Link>
                </Button>
              )}
              {pathname?.startsWith("/payment") && (
                <Button
                  variant="neumorphic"
                  size="sm"
                  className={cn(
                    "w-full justify-start nm-convex rounded-lg",
                    "text-muted-foreground"
                  )}
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link href="/create" onClick={(e) => { e.preventDefault(); goToCreate(); }} className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Create</span>
                  </Link>
                </Button>
              )}
              {pathname === "/dashboard" && (
                <>
                  <Button
                    variant="neumorphic"
                    size="sm"
                    className={cn(
                      "w-full justify-start nm-convex rounded-lg",
                      "text-muted-foreground"
                    )}
                    asChild
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Link href="/payment" onClick={(e) => { e.preventDefault(); goToPayment(); }} className="flex items-center space-x-2">
                      <WalletIcon className="h-5 w-5" />
                      <span>Payment</span>
                    </Link>
                  </Button>
                  <Button
                    variant="neumorphic"
                    size="sm"
                    className={cn(
                      "w-full justify-start nm-convex rounded-lg",
                      "text-muted-foreground"
                    )}
                    asChild
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Link href="/create" onClick={(e) => { e.preventDefault(); goToCreate(); }} className="flex items-center space-x-2">
                      <FileText className="h-5 w-5" />
                      <span>Create</span>
                    </Link>
                  </Button>
                </>
              )}
              <div className="flex flex-col items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                <OnchainWallet>
                  <ConnectWallet
                    className="inline-flex items-center gap-2 nm-convex rounded-lg px-4 h-9"
                  >
                    <Avatar className="h-4 w-4" />
                    <span className="text-black dark:!text-white">{wagmiIsConnected && wagmiAddress ? `${wagmiAddress.slice(0,6)}…${wagmiAddress.slice(-4)}` : "Connect Wallet"}</span>
                  </ConnectWallet>
                </OnchainWallet>
                {wagmiIsConnected && (
                  <Button
                    variant="neumorphic"
                    size="sm"
                    className="w-full nm-convex rounded-lg"
                    onClick={async () => { await disconnect(); setIsMenuOpen(false); }}
                  >
                    Disconnect Wallet
                  </Button>
                )}
              </div>
           </div>
         )}
        </div>
      </nav>
    )
}
