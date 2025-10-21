"use client"

import { useEffect, useMemo, useState } from "react"
import { InvoicePreview } from "@/components/invoice-preview"
import { generateInvoicePDF, sendInvoiceEmail, type InvoiceData, type InvoiceItem } from "@/lib/pdf-generator"
// import Loader from "@/components/loader"
// removed modal components

export default function PreviewPage() {
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  // no modal needed

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

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item?.amount ?? 0), 0)
    const taxRate = (invoiceData?.taxRate ?? 10) / 100
    const tax = subtotal * taxRate
    const total = subtotal + tax
    return { subtotal, tax, total }
  }, [items, invoiceData])


  if (!invoiceData) {
    // Avoid flashing an empty-state message; rely on validation in Create page
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

  // inline icons are shown within the preview component; no modal toggle

  const handleSendEmail = async () => {
    try {
      await sendInvoiceEmail(invoiceData, items)
    } catch (err) {
      console.error(err)
      alert("Unable to open email client. Please try again.")
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      const msg = `Invoice ${invoiceData.invoiceNumber}\n` +
        `Amount: $${totals.total.toFixed(2)} ${invoiceData.currency}\n` +
        `Issue: ${new Date(invoiceData.issueDate).toLocaleDateString()}\n` +
        `Due: ${new Date(invoiceData.dueDate).toLocaleDateString()}\n` +
        (invoiceData.merchantWalletAddress ? `Pay To (Base): ${invoiceData.merchantWalletAddress}\n` : "") +
        `\nThis invoice was generated with Invoisio.`

      const url = `https://wa.me/?text=${encodeURIComponent(msg)}`
      window.open(url, "_blank")
    } catch (err) {
      console.error(err)
      alert("Unable to open WhatsApp. Please try again.")
    }
  }

  return (
    <div className="min-h-screen py-8">
      <InvoicePreview
        invoiceData={invoiceData}
        items={items}
        onDownloadPDF={handleDownloadPDF}
        onSendEmail={handleSendEmail}
        onSendWhatsApp={handleSendWhatsApp}
        showPayment={false}
      />
    </div>
  )
}