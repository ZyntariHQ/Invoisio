"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Loader2, Trash2, Save, ArrowLeft } from "lucide-react"
import { useAccount } from "wagmi"
import { CryptoPayment } from "@/components/crypto-payment"


export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { address } = useAccount()
  const id = String(params?.id ?? "")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [invoice, setInvoice] = useState<any | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const data = await api.invoices.get(id)
        if (mounted) setInvoice(data)
      } catch (e: any) {
        toast.error("Failed to load invoice")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (id) load()
    return () => { mounted = false }
  }, [id])

  const totalAmountUSD = useMemo(() => {
    if (!invoice) return 0
    if (typeof invoice.total === "number") return invoice.total
    // Fallback: sum items
    const items = Array.isArray(invoice.items) ? invoice.items : []
    return items.reduce((sum: number, it: any) => sum + (Number(it.amount ?? it.total ?? 0)), 0)
  }, [invoice])

  const handleSave = async () => {
    if (!invoice) return
    setSaving(true)
    try {
      const payload = {
        title: invoice.title,
        client: invoice.client,
        notes: invoice.notes,
        status: invoice.status,
        items: invoice.items,
        currency: invoice.currency ?? "USD",
        total: totalAmountUSD,
      }
      await api.invoices.update(id, payload as any)
      toast.success("Invoice updated")
    } catch (e: any) {
      toast.error(String(e?.message ?? "Update failed"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this invoice?")) return
    setDeleting(true)
    try {
      await api.invoices.remove(id)
      toast.success("Invoice deleted")
      router.push("/invoices")
    } catch (e: any) {
      toast.error(String(e?.message ?? "Delete failed"))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Invoice not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">The requested invoice could not be loaded.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>

      <Card className="nm-flat">
        <CardHeader>
          <CardTitle className="text-foreground">Invoice #{invoice?.id ?? id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Title</label>
              <Input value={invoice.title ?? ""} onChange={(e) => setInvoice({ ...invoice, title: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Client Name</label>
              <Input value={invoice.client?.name ?? ""} onChange={(e) => setInvoice({ ...invoice, client: { ...(invoice.client ?? {}), name: e.target.value } })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Client Email</label>
              <Input value={invoice.client?.email ?? ""} onChange={(e) => setInvoice({ ...invoice, client: { ...(invoice.client ?? {}), email: e.target.value } })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <Input value={invoice.status ?? "draft"} onChange={(e) => setInvoice({ ...invoice, status: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Notes</label>
            <Textarea value={invoice.notes ?? ""} onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })} />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground">Total (USD)</div>
            <div className="text-2xl font-semibold">${totalAmountUSD.toFixed(2)}</div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4 mr-2" /> {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment section */}
      <div className="rounded-lg bg-[#121212] p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Pay with Crypto</h3>
        <CryptoPayment amount={totalAmountUSD} currency="USD" />
      </div>
    </div>
  )
}