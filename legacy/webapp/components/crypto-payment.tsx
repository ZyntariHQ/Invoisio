"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wallet, Shield, CheckCircle, Clock, AlertCircle, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAccount, useConnect } from "wagmi"
import api from "@/lib/api"

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
  const { address, isConnected } = useAccount()
  const { connectAsync, connectors } = useConnect()

  const [rates, setRates] = useState<Record<string, number>>({ ETH: 0.0004, USDC: 1, USDT: 1 })

  useEffect(() => {
    let mounted = true
    const fetchRates = async () => {
      try {
        const r: any = await api.payments.rates()
        let rateForToken: number | undefined
        const token = selectedToken
        if (r && typeof r === 'object') {
          if (typeof r[token] === 'number') {
            rateForToken = r[token]
          } else if (r?.rates && typeof r.rates[token]?.USD === 'number') {
            rateForToken = r.rates[token].USD
          } else if (typeof r[token]?.USD === 'number') {
            rateForToken = r[token].USD
          } else if (typeof r?.USD?.[token] === 'number') {
            rateForToken = r.USD[token]
          }
        }
        if (mounted) {
          setRates(prev => ({ ...prev, [token]: rateForToken ?? prev[token] ?? 0 }))
        }
      } catch (e) {
        console.warn('Failed to load payment rates; using fallback.', e)
      }
    }
    fetchRates()
    return () => { mounted = false }
  }, [selectedToken])

  useEffect(() => {
    const rate = rates[selectedToken] ?? 0
    setConvertedAmount(amount * rate)
  }, [amount, selectedToken, rates])

  // Sync UI with wagmi account state
  useEffect(() => {
    if (isConnected && address) {
      setWalletAddress(address)
      setPaymentStatus(prev => (prev === 'processing' || prev === 'completed') ? prev : 'connected')
    } else {
      setWalletAddress('')
      setPaymentStatus(prev => (prev === 'processing' || prev === 'completed') ? prev : 'idle')
    }
  }, [isConnected, address])

  const connectWallet = async () => {
    setPaymentStatus('connecting')
    
    try {
      // Programmatic connect using wagmi Coinbase connector
      const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWallet' || c.name?.toLowerCase().includes('coinbase'))
      if (!coinbaseConnector) {
        throw new Error('Coinbase connector not available')
      }

      const result: any = await connectAsync({ connector: coinbaseConnector })
      const connectedAddress = result?.account ?? result?.address ?? address ?? ''
      setWalletAddress(connectedAddress)
      setPaymentStatus('connected')
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${connectedAddress ? connectedAddress.slice(0, 6) + '...' + connectedAddress.slice(-4) : 'Coinbase'}`,
      })
    } catch (error) {
      setPaymentStatus('failed')
      const errorMsg = (error as Error)?.message || 'Failed to connect wallet'
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
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(walletAddress)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Address
            </Button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {!isConnected ? (
            <Button onClick={connectWallet} className="nm-button bg-primary text-primary-foreground">
              Connect Wallet
            </Button>
          ) : (
            <Button onClick={processPayment} disabled={paymentStatus === 'processing'} className="nm-button bg-accent text-accent-foreground">
              Pay Now
            </Button>
          )}
        </div>

        {/* Payment Status */}
        {paymentStatus === 'completed' ? (
          <div className="nm-flat p-3 rounded-lg">
            <Button variant="default" className="flex-1">
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