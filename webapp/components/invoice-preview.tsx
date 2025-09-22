"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Download, Send, Shield, Wallet } from "lucide-react"
import Image from "next/image"
import { CryptoPayment } from "@/components/crypto-payment"

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

interface InvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  clientName: string
  clientEmail: string
  clientAddress: string
  notes: string
  currency: string
}

interface InvoicePreviewProps {
  invoiceData: InvoiceData
  items: InvoiceItem[]
  onDownloadPDF: () => void
  onSendInvoice: () => void
  showPayment?: boolean
}

export function InvoicePreview({ invoiceData, items, onDownloadPDF, onSendInvoice, showPayment = false }: InvoicePreviewProps) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * 0.1 // 10% tax
  const total = subtotal + tax

  return (
    <div className="space-y-6">
      {/* PDF Preview */}
      <Card className="nm-card text-black max-w-2xl mx-auto">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Image
                  src="/assest/invoisio_logo.svg"
                  alt="Invoisio Logo"
                  width={40}
                  height={40}
                  className="object-contain"
                />
                <h1 className="text-2xl font-bold text-primary">Invoisio</h1>
              </div>
              <p className="text-sm text-gray-600">Privacy-First AI Invoice Generator</p>
            </div>
            <div className="text-right">
              <div className="nm-badge inline-block px-4 py-2 mb-2">
                <h2 className="text-2xl font-bold">INVOICE</h2>
              </div>
              <p className="text-muted-foreground">{invoiceData.invoiceNumber}</p>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="nm-flat p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Bill To:</h3>
              <div className="text-foreground">
                <p className="font-medium">{invoiceData.clientName}</p>
                <p className="text-sm">{invoiceData.clientEmail}</p>
                <p className="text-sm whitespace-pre-line">{invoiceData.clientAddress}</p>
              </div>
            </div>
            <div className="nm-flat p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Issue Date:</span>
                  <span className="text-foreground">{new Date(invoiceData.issueDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due Date:</span>
                  <span className="text-foreground">{new Date(invoiceData.dueDate).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8 nm-flat p-4 rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left py-2 text-foreground">Description</th>
                  <th className="text-center py-2 text-foreground">Qty</th>
                  <th className="text-right py-2 text-foreground">Rate</th>
                  <th className="text-right py-2 text-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/30">
                    <td className="py-3 text-foreground">{item.description}</td>
                    <td className="py-3 text-center text-foreground">{item.quantity}</td>
                    <td className="py-3 text-right text-foreground">${item.rate.toFixed(2)}</td>
                    <td className="py-3 text-right text-foreground">${item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-2 nm-flat p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="text-foreground">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (10%):</span>
                <span className="text-foreground">${tax.toFixed(2)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span className="text-foreground">Total:</span>
                <span className="text-primary">
                  ${total.toFixed(2)} {invoiceData.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoiceData.notes && (
            <div className="mb-8 nm-flat p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Notes:</h3>
              <p className="text-foreground text-sm whitespace-pre-line">{invoiceData.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center space-x-2">
                <div className="nm-icon-container-sm">
                  <Shield className="h-3 w-3" />
                </div>
                <span>Secured with Zero-Knowledge Proofs</span>
              </div>
              <span>Generated by Invoisio</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-6">
        <div className="flex justify-center space-x-4">
          <Button onClick={onDownloadPDF} variant="neumorphic" className="text-white">
            <div className="nm-icon-container-sm mr-2">
              <Download className="h-4 w-4" />
            </div>
            Download PDF
          </Button>
          <Button onClick={onSendInvoice} variant="neumorphic" className="bg-secondary text-black font-medium">
            <div className="nm-icon-container-sm mr-2">
              <Send className="h-4 w-4" />
            </div>
            Send Invoice
          </Button>
        </div>

        {/* Crypto Payment Section */}
        {showPayment && (
          <div className="max-w-md mx-auto">
            <CryptoPayment
              amount={total}
              currency="USD"
              onPaymentComplete={(txHash) => {
                console.log('Payment completed:', txHash)
                // Handle payment completion
              }}
              onPaymentError={(error) => {
                console.error('Payment error:', error)
                // Handle payment error
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
