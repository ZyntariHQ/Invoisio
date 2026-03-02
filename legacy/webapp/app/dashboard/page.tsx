"use client"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Users, DollarSign, TrendingUp, Plus, Bell } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import api from "@/lib/api"
import { useBasenameContext, useBasenameDisplay } from "@/hooks/use-basename"
import { useAccount } from "wagmi"

export default function DashboardPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const { address, name, loading } = useBasenameContext()
  const { isConnected } = useAccount()
  const basenameDisplay = useBasenameDisplay(address || undefined)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('evm_auth_token') : null
        if (!token) {
          if (mounted) {
            setNotifications([])
            setUnreadCount(0)
          }
          return
        }
        const [list, unread] = await Promise.all([
          api.notifications.list().catch(() => []),
          api.notifications.unreadCount().catch(() => 0),
        ])
        const unreadNum = typeof unread === 'number' ? unread : (unread as any)?.count ?? 0
        if (mounted) {
          setNotifications(Array.isArray(list) ? list : [])
          setUnreadCount(unreadNum)
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 60000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadInvoices = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('evm_auth_token') : null
        if (!token) {
          if (mounted) {
            setInvoices([])
            setRecentInvoices([])
          }
          return
        }
        const list: any[] = await api.invoices.list().catch(() => [])
        const arr = Array.isArray(list) ? list : []
        const sorted = arr.sort((a, b) => {
          const ta = new Date(a?.createdAt ?? 0).getTime()
          const tb = new Date(b?.createdAt ?? 0).getTime()
          return tb - ta
        })
        if (mounted) {
          setInvoices(arr)
          setRecentInvoices(sorted.slice(0, 5))
        }
      } catch {
        if (mounted) {
          setInvoices([])
          setRecentInvoices([])
        }
      }
    }
    loadInvoices()
    return () => { mounted = false }
  }, [])

  const formatAmount = (v: any) => {
    const n = typeof v === 'number' ? v : Number(v ?? 0)
    if (!isNaN(n)) return `$${n.toLocaleString()}`
    return String(v ?? '$0')
  }

  const statusClass = (s: any) => {
    const st = String(s ?? '').toLowerCase()
    if (st.includes('paid')) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
    if (st.includes('pending') || st.includes('unpaid') || st.includes('sent') || st.includes('overdue')) return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
    return "bg-muted text-muted-foreground"
  }

  const totalInvoices = invoices.length
  const activeClients = Array.from(new Set(invoices.map((i: any) => String(i.client?.name ?? i.clientName ?? i.customerName ?? i.client ?? '')).filter(Boolean))).length
  const totalRevenue = invoices.reduce((sum: number, i: any) => sum + (Number(i.totalAmount ?? i.total ?? i.amount ?? 0) || 0), 0)
  const pendingRevenue = invoices.filter((i: any) => {
    const st = String(i.status ?? '').toLowerCase()
    return !st.includes('paid') && (st.includes('pending') || st.includes('sent') || st.includes('overdue') || st === '' || st === 'draft')
  }).reduce((sum: number, i: any) => sum + (Number(i.totalAmount ?? i.total ?? i.amount ?? 0) || 0), 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--nm-background)' }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-poppins font-bold text-foreground mb-2">
            Dashboard
            {unreadCount > 0 && (
              <span className="ml-3 align-middle text-xs px-2 py-1 rounded-full bg-red-500 text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground">Welcome back! Here's your invoice overview.</p>
          {isConnected && (
            <p className="text-xs text-muted-foreground mt-1">
              Connected as: {loading ? 'Resolving…' : basenameDisplay.display}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="nm-flat rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex_row items_center justify_between space_y_0 pb_2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{totalInvoices}</div>
                <p className="text-xs text-muted-foreground">Updated from backend</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex_row items_center justify_between space_y_0 pb_2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Clients</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{activeClients}</div>
                <p className="text-xs text-muted-foreground">Unique clients from invoices</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex_row items_center justify_between space_y_0 pb_2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">${totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Sum of invoice totals</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex_row items_center justify_between space_y_0 pb_2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payments</CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">${pendingRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {invoices.filter((i: any) => {
                    const st = String(i.status ?? '').toLowerCase()
                    return !st.includes('paid') && (st.includes('pending') || st.includes('sent') || st.includes('overdue') || st === '' || st === 'draft')
                  }).length} invoices pending
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="nm-flat rounded-lg p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Quick Actions</CardTitle>
                <CardDescription className="text-muted-foreground">Get started with common tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                  <Link href="/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Invoice
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <Link href="/create#client-information">
                    <Users className="h-4 w-4 mr-2" />
                    Add New Client
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Recent Invoices</CardTitle>
                <CardDescription className="text-muted-foreground">Your latest invoice activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentInvoices.length ? (
                    recentInvoices.map((inv: any, idx: number) => (
                      <div key={inv.id ?? inv.invoiceId ?? idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-foreground font-medium">{String(inv.invoiceId ?? inv.id ?? 'INV')}</p>
                          <p className="text-muted-foreground text-sm">{String(inv.client?.name ?? inv.customerName ?? inv.merchant ?? inv.client ?? 'Unknown Client')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-foreground font-medium">{formatAmount(inv.totalAmount ?? inv.amount ?? inv.total)}</p>
                          <span
                            className={cn(
                              "text-xs px-2 py-1 rounded-full",
                              statusClass(inv.status)
                            )}
                          >
                            {String(inv.status ?? 'Pending')}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-sm">No invoices found.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Notifications */}
        <div className="nm-flat rounded-lg p-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Notifications
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Recent activity and alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notifications.length ? (
                  notifications.slice(0, 5).map((n: any, idx: number) => (
                    <div key={n.id ?? idx} className="flex items-start justify_between p_3 bg_muted/50 rounded_lg">
                      <div className="flex-1">
                        <p className="text-foreground text-sm font-medium">{String(n.title ?? n.message ?? n.text ?? 'Notification')}</p>
                        {n.createdAt && (
                          <p className="text-muted-foreground text-xs mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-sm">No notifications yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
