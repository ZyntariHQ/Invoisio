"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wallet, Shield, CheckCircle, Clock, AlertCircle, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CryptoPaymentProps {
  amount: number
  currency?: string
  onPaymentComplete?: (txHash: string) => void
  onPaymentError?: (error: string) => void
}

type PaymentStatus = 'idle' | 'connecting' | 'connected' | 'processing' | 'completed' | 'failed'

const SUPPORTED_TOKENS = [
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠' },
  { symbol: 'USDC', name: 'USD Coin', icon: '💵' },
  { symbol: 'USDT', name: 'Tether USD', icon: '💰' }
]

export function CryptoPayment({ amount, currency = 'USD', onPaymentComplete, onPaymentError }: CryptoPaymentProps) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
  const [selectedToken, setSelectedToken] = useState('ETH')
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [txHash, setTxHash] = useState<string>('')
  const [convertedAmount, setConvertedAmount] = useState<number>(0)
  const { toast } = useToast()

  // Mock conversion rates (in real app, fetch from API)
  const conversionRates = {
    ETH: 0.0004, // 1 USD = 0.0004 ETH
    USDC: 1,     // 1 USD = 1 USDC
    USDT: 1      // 1 USD = 1 USDT
  }

  useEffect(() => {
    const rate = conversionRates[selectedToken as keyof typeof conversionRates]
    setConvertedAmount(amount * rate)
  }, [amount, selectedToken])

  const connectWallet = async () => {
    setPaymentStatus('connecting')
    
    try {
      // Mock wallet connection (replace with actual EVM wallet integration)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock wallet address
      const mockAddress = '0x1234...abcd'
      setWalletAddress(mockAddress)
      setPaymentStatus('connected')
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${mockAddress}`,
      })
    } catch (error) {
      setPaymentStatus('failed')
      const errorMsg = 'Failed to connect wallet'
      onPaymentError?.(errorMsg)
      toast({
        title: "Connection Failed",
        description: errorMsg,
        variant: "destructive"
      })
    }
  }

  const processPayment = async () => {
    setPaymentStatus('processing')
    
    try {
      // Mock payment processing (replace with actual Base (EVM) transaction)
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Mock transaction hash
      const mockTxHash = '0xabcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234'
      setTxHash(mockTxHash)
      setPaymentStatus('completed')
      
      onPaymentComplete?.(mockTxHash)
      toast({
        title: "Payment Successful",
        description: `Transaction: ${mockTxHash.slice(0, 10)}...`,
      })
    } catch (error) {
      setPaymentStatus('failed')
      const errorMsg = 'Payment failed'
      onPaymentError?.(errorMsg)
      toast({
        title: "Payment Failed",
        description: errorMsg,
        variant: "destructive"
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    })
  }

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Wallet className="h-4 w-4" />
    }
  }

  const getStatusText = () => {
    switch (paymentStatus) {
      case 'connecting':
        return 'Connecting to wallet...'
      case 'connected':
        return 'Wallet connected'
      case 'processing':
        return 'Processing payment...'
      case 'completed':
        return 'Payment completed'
      case 'failed':
        return 'Payment failed'
      default:
        return 'Connect wallet to pay'
    }
  }

  return (
    <Card className="nm-flat">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="h-5 w-5 text-primary" />
          <span>Crypto Payment</span>
          <Badge variant="secondary" className="ml-auto">
            Base (EVM)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Payment Token</label>
          <Select value={selectedToken} onValueChange={setSelectedToken}>
            <SelectTrigger className="nm-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_TOKENS.map((token) => (
                <SelectItem key={token.symbol} value={token.symbol}>
                  <div className="flex items-center space-x-2">
                    <span>{token.icon}</span>
                    <span>{token.symbol}</span>
                    <span className="text-muted-foreground">- {token.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Amount Display */}
        <div className="nm-flat p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount ({currency}):</span>
            <span className="font-medium">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pay with {selectedToken}:</span>
            <span className="font-bold text-primary">
              {convertedAmount.toFixed(6)} {selectedToken}
            </span>
          </div>
        </div>

        <Separator />

        {/* Wallet Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className="text-sm">{getStatusText()}</span>
          </div>
          {walletAddress && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(walletAddress)}
              className="h-6 px-2"
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {paymentStatus === 'idle' || paymentStatus === 'failed' || paymentStatus === 'connecting' ? (
            <Button
              onClick={connectWallet}
              disabled={paymentStatus === 'connecting'}
              className="w-full"
              variant="default"
            >
              <Wallet className="h-4 w-4 mr-2" />
              {paymentStatus === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          ) : paymentStatus === 'connected' ? (
            <Button
              onClick={processPayment}
              className="w-full"
              variant="default"
            >
              <Shield className="h-4 w-4 mr-2" />
              Pay {convertedAmount.toFixed(6)} {selectedToken}
            </Button>
          ) : paymentStatus === 'processing' ? (
            <Button disabled className="w-full">
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Processing Payment...
            </Button>
          ) : paymentStatus === 'completed' ? (
            <div className="space-y-2">
              <Button disabled className="w-full bg-green-500 hover:bg-green-500">
                <CheckCircle className="h-4 w-4 mr-2" />
                Payment Completed
              </Button>
              {txHash && (
                <div className="text-xs text-muted-foreground">
                  <p>Transaction Hash:</p>
                  <p className="font-mono break-all">{txHash}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Privacy Notice */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <div className="flex items-start space-x-2">
            <Shield className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Privacy Protected</p>
              <p>Payment details are secured with zero-knowledge proofs. Your transaction data remains private while maintaining verifiability.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}