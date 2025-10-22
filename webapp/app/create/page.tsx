"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Plus, Trash2, Sparkles, Eye } from "lucide-react"
import { InvoicePreview } from "@/components/invoice-preview"
import { generateInvoicePDF, sendInvoiceEmail } from "@/lib/pdf-generator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CryptoPayment } from "@/components/crypto-payment"
// import Loader from "@/components/loader"
import { useToast } from "@/hooks/use-toast"
import { useEvmWallet } from "@/hooks/use-evm-wallet"
import { useInvoiceStore } from "@/hooks/use-invoice-store"
import { useAccount } from "wagmi"
import { useAppLoader } from "@/components/loader-provider"

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

export default function CreateInvoicePage() {
  const { address } = useEvmWallet()
  const { address: wagmiAddress, isConnected: wagmiIsConnected } = useAccount()
  const { withLoader } = useAppLoader()
  const {
    items,
    invoiceData,
    addItem,
    removeItem,
    updateItem,
    setItems,
    setInvoiceData,
    showPreview,
    setShowPreview,
    setMerchantWalletAddress,
  } = useInvoiceStore()



  useEffect(() => {
    const resolved = wagmiAddress || address || ""
    setMerchantWalletAddress(resolved)
  }, [wagmiAddress, address, setMerchantWalletAddress])

  const { toast } = useToast()

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = subtotal * ((invoiceData.taxRate ?? 0) / 100)
  const total = subtotal + tax

  const generateWithAI = () => {
    // AI generation simulation
    const aiDescriptions = [
      "Website Development - Frontend React Components",
      "UI/UX Design - Mobile App Interface",
      "Backend API Development - User Authentication",
      "Database Design - PostgreSQL Schema",
    ]

    const updatedItems = items.map((item, index) => ({
      ...item,
      description: aiDescriptions[index] || item.description,
      rate: 75 + index * 25,
      quantity: 8 + index * 2,
      amount: (75 + index * 25) * (8 + index * 2),
    }))

    setItems(updatedItems)
  }

  const validateInvoice = (): string[] => {
    const errors: string[] = []
    if (!invoiceData.invoiceNumber?.trim()) errors.push("Invoice number is required.")
    if (!invoiceData.issueDate) errors.push("Issue date is required.")
    if (!invoiceData.dueDate) errors.push("Due date is required.")
    // Client name and email no longer required
    // Client address no longer required; default text will be used
    if (!items.length) errors.push("Add at least one invoice item.")
    items.forEach((item, idx) => {
      if (!item.description?.trim()) errors.push(`Item ${idx + 1}: description required.`)
      if (!item.quantity || item.quantity <= 0) errors.push(`Item ${idx + 1}: quantity must be > 0.`)
      if (item.rate === undefined || item.rate < 0) errors.push(`Item ${idx + 1}: rate must be ≥ 0.`)
    })
    return errors
  }

  const handleDownloadPDF = async () => {
    try {
      const errors = validateInvoice()
      if (errors.length) {
        toast({
          title: "Missing invoice details",
          description: errors[0],
          variant: "destructive",
        })
        return
      }
      await generateInvoicePDF(invoiceData as any, items as any)
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast({
        title: "Error generating PDF",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSendInvoice = async () => {
    try {
      const errors = validateInvoice()
      if (errors.length) {
        toast({
          title: "Cannot send invoice",
          description: errors[0],
          variant: "destructive",
        })
        return
      }
      await sendInvoiceEmail(invoiceData as any, items as any)
      toast({ title: "Email draft opened", description: "Review and send to your client." })
    } catch (error) {
      console.error("Error sending invoice:", error)
      toast({
        title: "Error sending invoice",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSendEmail = async () => {
    try {
      const errors = validateInvoice()
      if (errors.length) {
        toast({
          title: "Cannot send invoice",
          description: errors[0],
          variant: "destructive",
        })
        return
      }
      await sendInvoiceEmail(invoiceData as any, items as any)
      toast({ title: "Email draft opened", description: "Review and send to your client." })
    } catch (error) {
      console.error("Error sending email:", error)
      toast({
        title: "Error sending email",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      const errors = validateInvoice()
      if (errors.length) {
        toast({
          title: "Cannot share invoice",
          description: errors[0],
          variant: "destructive",
        })
        return
      }
      const message = `Invoice ${invoiceData.invoiceNumber || ''} total $${total.toFixed(2)}. Due ${invoiceData.dueDate || ''}.`
      const url = `https://wa.me/?text=${encodeURIComponent(message)}`
      window.open(url, "_blank")
      toast({ title: "WhatsApp opened", description: "Select a contact to share the invoice." })
    } catch (error) {
      console.error("Error preparing WhatsApp share:", error)
      toast({
        title: "Error opening WhatsApp",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-poppins font-bold text-foreground mb-2">Create Invoice</h1>
          <p className="text-muted-foreground">Generate professional invoices with AI assistance</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Invoice Form */}
          <div className="lg:col-span-2">
            <div className="nm-flat rounded-lg p-6 space-y-6">
            {/* Invoice Details */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="invoiceNumber">
                      Invoice Number
                    </Label>
                    <Input
                      id="invoiceNumber"
                      value={invoiceData.invoiceNumber}
                      onChange={(e) => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="issueDate">
                      Issue Date
                    </Label>
                    <Input
                      id="issueDate"
                      type="date"
                      value={invoiceData.issueDate}
                      onChange={(e) => setInvoiceData({ ...invoiceData, issueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dueDate">
                      Due Date
                    </Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={invoiceData.dueDate}
                      onChange={(e) => setInvoiceData({ ...invoiceData, dueDate: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client Information */}
            <Card id="client-information" className="hidden">
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="clientName">
                      Client Name
                    </Label>
                    <Input
                      id="clientName"
                      value={invoiceData.clientName}
                      onChange={(e) => setInvoiceData({ ...invoiceData, clientName: e.target.value })}
                      placeholder="Enter client name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientEmail">
                      Client Email
                    </Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={invoiceData.clientEmail}
                      onChange={(e) => setInvoiceData({ ...invoiceData, clientEmail: e.target.value })}
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="clientAddress">
                    Client Address
                  </Label>
                  <Textarea
                    id="clientAddress"
                    value={invoiceData.clientAddress}
                    onChange={(e) => setInvoiceData({ ...invoiceData, clientAddress: e.target.value })}
                    placeholder="Enter client address"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Invoice Items</CardTitle>
                <Button onClick={generateWithAI} variant="default" size="sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Generate
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-sm">Description</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder="Service description"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Qty</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Rate</Label>
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateItem(item.id, "rate", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-sm">Amount</Label>
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(item.id, "amount", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-1">
                      {items.length > 1 && (
                        <Button
                          onClick={() => removeItem(item.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  onClick={addItem}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                  placeholder="Payment terms, thank you message, etc."
                  rows={4}
                />
              </CardContent>
            </Card>
            </div>
          </div>

          {/* Invoice Preview */}
          <div className="lg:col-span-1">
            <div className="nm-flat rounded-lg p-6">
              <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="text-foreground">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tax (%):</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-20 h-8 text-right"
                        value={invoiceData.taxRate}
                        onChange={(e) => setInvoiceData({ ...invoiceData, taxRate: Number.parseFloat(e.target.value) || 0 })}
                      />
                      <span className="text-muted-foreground">= ${tax.toFixed(2)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span className="text-foreground">Total:</span>
                    <span className="text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={async () => {
                      const errors = validateInvoice()
                      if (errors.length) {
                        toast({
                          title: "Cannot preview invoice",
                          description: errors[0],
                          variant: "destructive",
                        })
                        return
                      }
                      try {
                        await withLoader(async () => {
                          window.localStorage.setItem("invoice-preview", JSON.stringify({ invoiceData, items }))
                          window.open("/preview", "_blank")
                          await new Promise((res) => setTimeout(res, 250))
                        })
                      } catch (e) {
                        console.error("Failed to open preview", e)
                        toast({
                          title: "Failed to open preview",
                          description: "Please try again.",
                          variant: "destructive",
                        })
                      }
                    }}
                    variant="default"
                    className="w-full"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Invoice
                  </Button>
                  <Button
                    onClick={handleDownloadPDF}
                    variant="secondary"
                    className="w-full font-medium"
                  >
                    Generate & Download PDF
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Privacy-preserving generation</p>
                  <p>• Client data remains private</p>
                  <p>• Blockchain verification included</p>
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        </div>

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="w-[92vw] sm:w-[85vw] lg:w-[70vw] max-w-4xl max-h-[90vh] overflow-y-auto p-0 z-[100010]">
            <DialogHeader>
              <DialogTitle>Invoice Preview</DialogTitle>
            </DialogHeader>
            <InvoicePreview
              invoiceData={invoiceData as any}
              items={items as any}
              onDownloadPDF={handleDownloadPDF}
            />
          </DialogContent>
        </Dialog>
        </main>
     </div>
   )
 }
