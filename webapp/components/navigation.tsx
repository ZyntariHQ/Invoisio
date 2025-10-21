"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FileText, BarChart3, PieChart, Bell, Wallet as WalletIcon, Menu, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState, useEffect } from "react"
import { useEvmWallet } from "@/hooks/use-evm-wallet"
import { useIsMobile } from "@/hooks/use-mobile"
import { WalletConnectModal } from "@/components/wallet-connect-modal"
import { Wallet as OnchainWallet, ConnectWallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet"
import { Identity, Avatar, Name, Address } from "@coinbase/onchainkit/identity"
import dynamic from "next/dynamic"

const navigation = []
const WalletHeader = dynamic(() => import("@/components/wallet-header").then(m => m.WalletHeader), { ssr: false })

export function Navigation() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const { isConnected, displayAddress, connect } = useEvmWallet()

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
              
              {/* Notification Dropdown */}
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
            {/* Route-specific quick nav icons */}
            {pathname?.startsWith("/create") && (
              <Button
                variant="neumorphic"
                size="icon"
                className={cn("w-9 h-9 rounded-full nm-convex", "text-muted-foreground")}
                asChild
              >
                <Link href="/payment">
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
                <Link href="/create">
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
           <Button
              variant="neumorphic"
              size="sm"
              className="w-full justify-start nm-convex rounded-lg text-muted-foreground hover:text-primary relative"
              onClick={() => {
                setIsNotificationOpen(!isNotificationOpen)
                setIsMenuOpen(false)
              }}
            >
              <div className="flex items-center space-x-2">
                <Bell className="h-5 w-5" />
                <span>Notifications</span>
              </div>
              <span className="absolute top-2 left-8 h-2 w-2 bg-red-500 rounded-full"></span>
            </Button>
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
                  <Link href="/payment" className="flex items-center space-x-2">
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
                  <Link href="/create" className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Create</span>
                  </Link>
                </Button>
              )}
              <Button
                variant="neumorphic"
                size="sm"
                className="w-full text-primary flex items-center justify-center space-x-2 nm-convex rounded-lg px-4"
                onClick={() => { setIsWalletModalOpen(true); setIsMenuOpen(false) }}
              >
                <WalletIcon className="h-4 w-4" />
                <span>{isConnected && displayAddress ? displayAddress : "Connect Wallet"}</span>
              </Button>
           </div>
         )}
         <WalletConnectModal open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen} onConnect={connect} />
       </div>
     </nav>
   )
 }
