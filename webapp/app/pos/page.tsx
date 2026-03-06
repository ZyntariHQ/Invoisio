"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import api from "@/lib/api"

export default function POSPage() {
  const [amount, setAmount] = useState("")
  const [asset, setAsset] = useState("XLM")
  const [memo, setMemo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const validateForm = (): string | null => {
    const numAmount = parseFloat(amount)
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return "Amount must be greater than 0"
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const error = validateForm()
    if (error) {
      toast({
        title: "Validation Error",
        description: error,
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    
    try {
      const payload = {
        invoiceNumber: `POS-${Date.now()}`,
        clientName: "Walk-in Customer",
        clientEmail: "pos@invoisio.app",
        description: memo || "Point of Sale Transaction",
        amount: parseFloat(amount),
        asset_code: asset,
        asset_issuer: asset === "USDC" 
          ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" 
          : undefined,
      }

      const response: any = await api.request("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      const invoiceId = response?.id
      
      if (invoiceId) {
        toast({
          title: "Invoice Created",
          description: "Redirecting to payment request...",
        })
        router.push(`/pos/payment/${invoiceId}`)
      } else {
        throw new Error("No invoice ID returned")
      }
    } catch (error: any) {
      console.error("Failed to create invoice:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to create invoice. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuickAmount = (value: number) => {
    setAmount(value.toString())
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-poppins font-bold text-foreground mb-2">
            Point of Sale
          </h1>
          <p className="text-muted-foreground">
            Quick invoice generation for face-to-face transactions
          </p>
        </div>

        <Card className="nm-flat">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span>New Transaction</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Amount Input */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-base font-semibold">
                  Amount *
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-2xl h-14 text-center font-bold"
                  required
                />
                
                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[10, 25, 50, 100].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      onClick={() => handleQuickAmount(value)}
                      className="h-10"
                    >
                      ${value}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Asset Selection */}
              <div className="space-y-2">
                <Label htmlFor="asset" className="text-base font-semibold">
                  Currency *
                </Label>
                <Select value={asset} onValueChange={setAsset}>
                  <SelectTrigger id="asset" className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XLM">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">XLM</span>
                        <span className="text-muted-foreground">- Stellar Lumens (Native)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="USDC">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">USDC</span>
                        <span className="text-muted-foreground">- USD Coin</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Memo/Note */}
              <div className="space-y-2">
                <Label htmlFor="memo" className="text-base font-semibold">
                  Memo/Note <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Textarea
                  id="memo"
                  placeholder="Add a note for internal tracking..."
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 text-lg font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Invoice...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-5 w-5" />
                    Generate Payment Request
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 border-primary/20">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">How it works:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enter the transaction amount</li>
                <li>Select the payment currency (XLM or USDC)</li>
                <li>Optionally add a memo for tracking</li>
                <li>Generate a QR code for instant payment</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
