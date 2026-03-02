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
import { useAccount } from "wagmi"
import dynamic from "next/dynamic"
import { Wallet as OnchainWallet, ConnectWallet } from "@coinbase/onchainkit/wallet"
import { Avatar } from "@coinbase/onchainkit/identity"
import { useAppLoader } from "@/components/loader-provider"
import api from "@/lib/api"
import { useEvmWallet } from "@/hooks/use-evm-wallet"

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
  const { disconnect, address } = useEvmWallet()
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [notifications, setNotifications] = useState<any[]>([])

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

  // Poll unread notifications count
  useEffect(() => {
    let active = true
    const fetchUnread = async () => {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('evm_auth_token') : null
      if (!token) { if (active) setUnreadCount(0); return }
      try {
        const res: any = await api.notifications.unreadCount()
        const c = typeof res === 'number' ? res : (res?.count ?? 0)
        if (active) setUnreadCount(c)
      } catch {
        if (active) setUnreadCount(0)
      }
    }
    fetchUnread()
    const id = setInterval(fetchUnread, 15000)
    return () => { active = false; clearInterval(id) }
  }, [])

  const fetchNotifications = async () => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('evm_auth_token') : null
    if (!token) { setNotifications([]); return }
    try {
      const res: any[] = await api.notifications.list()
      setNotifications(Array.isArray(res) ? res : [])
    } catch (e) {
      setNotifications([])
    }
  }

  useEffect(() => {
    if (isNotificationOpen) {
      fetchNotifications()
    }
  }, [isNotificationOpen])

  const markRead = async (id: string) => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('evm_auth_token') : null
    if (!token) { return }
    try {
      await api.notifications.markRead(id)
      setNotifications((prev) => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {}
  }

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
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-h-5 min-w-5 px-1 py-0.5 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white">
                    {unreadCount}
                  </span>
                )}
              </Button>
              {isNotificationOpen && (
                <div className="absolute right-0 top-12 w-80 bg-background border border-border rounded-lg shadow-lg z-50 nm-flat">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground">No notifications</div>
                    )}
                    {notifications.map((n) => (
                      <div key={n.id} className="p-4 border-b border-border/50 hover:bg-muted/50">
                        <div className="flex items-start gap-3">
                          <div className={cn("w-2 h-2 rounded-full mt-2 flex-shrink-0", n.read ? "bg-transparent" : "bg-blue-500")}></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{n.title || n.message || "Notification"}</p>
                            {n.createdAt && (
                              <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                            )}
                          </div>
                          {!n.read && (
                            <Button size="sm" variant="ghost" className="text-primary" onClick={() => markRead(n.id)}>
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-border">
                    <button className="text-sm text-primary hover:text-primary/80 font-medium w-full text-center" onClick={fetchNotifications}>
                      Refresh
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
                    <span className="text-black dark:!text-white">{wagmiIsConnected && (wagmiAddress || address) ? `${(wagmiAddress || address)!.slice(0,6)}…${(wagmiAddress || address)!.slice(-4)}` : "Connect Wallet"}</span>
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
