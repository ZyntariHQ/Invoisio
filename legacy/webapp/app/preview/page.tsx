"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { InvoicePreview } from "@/components/invoice-preview"
import { generateInvoicePDF, shareInvoicePDF, type InvoiceData, type InvoiceItem } from "@/lib/pdf-generator"

export default function PreviewPage() {
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const params = useSearchParams()

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("invoice-preview")
      if (raw) {
        const parsed = JSON.parse(raw)
        setInvoiceData(parsed.invoiceData || null)
        setItems(parsed.items || [])
      }
    } catch (e) {
      console.error("Failed to parse preview cache", e)
    }
  }, [])

  useEffect(() => {
    const shouldPrint = params?.get("print") === "1"
    if (shouldPrint && invoiceData && items.length) {
      // Auto-generate the PDF when requested via query
      generateInvoicePDF(invoiceData, items).catch((err) => {
        console.error(err)
        alert("Unable to generate the PDF automatically. Please allow popups and try again.")
      })
    }
  }, [params, invoiceData, items])

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item?.amount ?? 0), 0)
    const taxRate = (invoiceData?.taxRate ?? 10) / 100
    const tax = subtotal * taxRate
    const total = subtotal + tax
    return { subtotal, tax, total }
  }, [items, invoiceData])

  if (!invoiceData) {
    return null
  }

  const handleDownloadPDF = async () => {
    try {
      await generateInvoicePDF(invoiceData, items)
    } catch (err) {
      console.error(err)
      alert("Unable to generate the PDF. Please allow popups and try again.")
    }
  }

  const handleSharePDF = async () => {
    try {
      await shareInvoicePDF(invoiceData, items)
    } catch (err) {
      console.error(err)
      alert("Unable to share the PDF. The file will be downloaded instead.")
    }
  }

  return (
    <div className="min-h-screen py-8">
      <InvoicePreview
        invoiceData={invoiceData}
        items={items}
        onDownloadPDF={handleDownloadPDF}
        onSharePDF={handleSharePDF}
        showPayment={false}
      />
    </div>
  )
}