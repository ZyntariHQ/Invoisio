"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Download, Shield, Wallet, Copy, Mail, MessageCircle } from "lucide-react"
import Image from "next/image"
import { CryptoPayment } from "@/components/crypto-payment"
import { useToast } from "@/hooks/use-toast"

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
  // New optional field: merchant wallet address to display
  merchantWalletAddress?: string
  // Optional editable tax rate (%)
  taxRate?: number
}

interface InvoicePreviewProps {
  invoiceData: InvoiceData
  items: InvoiceItem[]
  onDownloadPDF: () => void
  onSendEmail?: () => void
  onSendWhatsApp?: () => void
  showPayment?: boolean
}

export function InvoicePreview({ invoiceData, items, onDownloadPDF, onSendEmail, onSendWhatsApp, showPayment = false }: InvoicePreviewProps) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * ((invoiceData.taxRate ?? 10) / 100)
  const total = subtotal + tax
  const { toast } = useToast()

  const handleCopyAddress = async () => {
    if (!invoiceData.merchantWalletAddress) return
    try {
      await navigator.clipboard.writeText(invoiceData.merchantWalletAddress)
      toast({ title: "Wallet address copied", description: "Paste to your wallet app" })
    } catch (e) {
      toast({ title: "Copy failed", description: "Please try again", variant: "destructive" })
    }
  }

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
                <span className="text-xl font-semibold tracking-tight">Invoisio</span>
              </div>
              <p className="text-sm text-gray-600">Privacy-First AI Invoice Generator</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">{invoiceData.invoiceNumber}</p>
            </div>
          </div>

          {/* Invoice Dates */}
          <div className="mb-8">
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

          {/* Merchant Wallet */}
          {invoiceData.merchantWalletAddress && (
            <div className="mb-8 nm-flat p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="nm-icon-container-sm">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold">Pay To (Base)</div>
                    <div className="text-xs text-muted-foreground">Send ETH/USDC on Base to this address</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCopyAddress} className="text-foreground">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
              </div>
              <div className="mt-3 text-foreground font-mono break-all text-sm">
                {invoiceData.merchantWalletAddress}
              </div>
            </div>
          )}

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
                <span className="text-muted-foreground">Tax ({invoiceData.taxRate ?? 10}%):</span>
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
              <p className="text-foreground text-sm whitespace-pre-line break-words">{invoiceData.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div />
              <div className="flex items-center space-x-2">
                <span>Powered by</span>
                <Image
                  src="/Base_Logo_0.svg"
                  alt="Base"
                  width={60}
                  height={16}
                  className="h-4 w-auto"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
        <div className="space-y-6">
        <div className="flex justify-center gap-4">
          <Button onClick={onDownloadPDF} variant="neumorphic" aria-label="Download PDF" className="rounded-full h-12 w-12 p-0 flex items-center justify-center">
            <Download className="h-5 w-5" />
          </Button>
          <Button onClick={onSendEmail} variant="neumorphic" aria-label="Send via Email" className="rounded-full h-12 w-12 p-0 flex items-center justify-center">
            <Mail className="h-5 w-5" />
          </Button>
          <Button onClick={onSendWhatsApp} variant="neumorphic" aria-label="Send via WhatsApp" className="rounded-full h-12 w-12 p-0 flex items-center justify-center">
            <MessageCircle className="h-5 w-5" />
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
