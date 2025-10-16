"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle, ExternalLink, Copy, Clock, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PaymentStatusProps {
  status: 'pending' | 'confirmed' | 'failed'
  txHash?: string
  amount: number
  token: string
  timestamp?: Date
  confirmations?: number
  requiredConfirmations?: number
}

export function PaymentStatus({
  status,
  txHash,
  amount,
  token,
  timestamp,
  confirmations = 0,
  requiredConfirmations = 3
}: PaymentStatusProps) {
  const { toast } = useToast()

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Transaction hash copied to clipboard",
    })
  }

  const openExplorer = () => {
    if (txHash) {
      // Base explorer URL (adjust for network)
      const explorerUrl = `https://basescan.org/tx/${txHash}`
      window.open(explorerUrl, '_blank')
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500'
      case 'pending':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'confirmed':
        return 'Payment Confirmed'
      case 'pending':
        return 'Payment Pending'
      case 'failed':
        return 'Payment Failed'
      default:
        return 'Unknown Status'
    }
  }

  return (
    <Card className="nm-flat">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </div>
          <Badge 
            variant="secondary" 
            className={`${getStatusColor()} text-white`}
          >
            {status.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Details */}
        <div className="nm-flat p-4 rounded-lg space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount:</span>
            <span className="font-bold text-primary">
              {amount.toFixed(6)} {token}
            </span>
          </div>
          
          {timestamp && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time:</span>
              <span className="text-foreground">
                {timestamp.toLocaleString()}
              </span>
            </div>
          )}

          {status === 'pending' && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confirmations:</span>
              <span className="text-foreground">
                {confirmations}/{requiredConfirmations}
              </span>
            </div>
          )}
        </div>

        {/* Transaction Hash */}
        {txHash && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Transaction Hash
            </label>
            <div className="flex items-center space-x-2 nm-flat p-3 rounded-lg">
              <code className="flex-1 text-xs font-mono break-all text-foreground">
                {txHash}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(txHash)}
                className="h-8 w-8 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openExplorer}
                className="h-8 w-8 p-0"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Status Messages */}
        <div className="text-sm">
          {status === 'confirmed' && (
            <div className="text-green-600 bg-green-50 p-3 rounded-lg">
              ✅ Payment has been confirmed on the blockchain. The invoice has been marked as paid.
            </div>
          )}
          
          {status === 'pending' && (
            <div className="text-yellow-600 bg-yellow-50 p-3 rounded-lg">
              ⏳ Payment is being processed. Please wait for blockchain confirmation.
            </div>
          )}
          
          {status === 'failed' && (
            <div className="text-red-600 bg-red-50 p-3 rounded-lg">
              ❌ Payment failed. Please try again or contact support.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {status === 'confirmed' && (
          <div className="flex space-x-2">
            <Button variant="default" className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Invoice as Paid
            </Button>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex space-x-2">
            <Button variant="default" className="flex-1">
              Retry Payment
            </Button>
            <Button variant="outline" className="flex-1">
              Contact Support
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}