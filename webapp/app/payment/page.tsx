"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wallet, ArrowRight, Copy, CheckCircle, AlertCircle, Clock } from "lucide-react"
// import { useEvmWallet } from "@/hooks/use-evm-wallet"
import { useToast } from "@/hooks/use-toast"
import { WalletConnectModal } from "@/components/wallet-connect-modal"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import Image from "next/image"

type SendStatus = 'idle' | 'connecting' | 'ready' | 'sending' | 'sent' | 'failed'

const TOKENS = [
  { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
]

function padTo64(hex: string) {
  return hex.padStart(64, '0')
}

function strip0x(input: string) {
  return input.startsWith('0x') ? input.slice(2) : input
}

function toUnitsHex(amount: string, decimals: number): string {
  const [whole, fracRaw] = amount.split('.')
  const frac = (fracRaw || '')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const wholeBI = BigInt(whole || '0')
  const fracBI = BigInt(fracPadded || '0')
  const base = 10n ** BigInt(decimals)
  const val = wholeBI * base + fracBI
  return '0x' + val.toString(16)
}

function encodeErc20Transfer(to: string, amountHex: string) {
  const selector = '0xa9059cbb'
  const toField = padTo64(strip0x(to).toLowerCase())
  const amountField = padTo64(strip0x(amountHex))
  return selector + toField + amountField
}

export default function PaymentPage() {
  // const { isConnected, address, displayAddress, connect, disconnect } = useEvmWallet()
  const { address: wagmiAddress, isConnected: wagmiIsConnected } = useAccount()
  const { connectors, connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { toast } = useToast()
  const [status, setStatus] = useState<SendStatus>('idle')
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [selectedToken, setSelectedToken] = useState<string>('ETH')
  const [recipient, setRecipient] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [tokenContractAddress, setTokenContractAddress] = useState<string>('')
  const [txHash, setTxHash] = useState<string>('')

  const displayAddress = wagmiAddress ? `${wagmiAddress.slice(0, 6)}…${wagmiAddress.slice(-4)}` : ''

  const tokenMeta = useMemo(() => TOKENS.find(t => t.symbol === selectedToken)!, [selectedToken])

  useEffect(() => {
    if (wagmiIsConnected) setStatus('ready')
  }, [wagmiIsConnected])

  const handleConnect = async () => {
    try {
      setStatus('connecting')
      const coinbase = connectors.find((c) => c.id === 'coinbaseWallet' || c.name?.toLowerCase().includes('coinbase'))
      if (!coinbase) {
        toast({ title: 'No connector', description: 'Coinbase connector not available', variant: 'destructive' })
        setStatus('failed')
        return
      }
      await connectAsync({ connector: coinbase })
      setStatus('ready')
      toast({ title: 'Wallet connected', description: displayAddress ? `Connected: ${displayAddress}` : 'Connected', progress: 100 })
    } catch (err: any) {
      setStatus('failed')
      toast({ title: 'Connection failed', description: err?.message || 'Unable to connect', variant: 'destructive' })
    }
  }

  const handleSend = async () => {
    try {
      if (!wagmiIsConnected || !wagmiAddress) {
        toast({ title: 'Wallet not connected', description: 'Please connect your wallet first', variant: 'destructive' })
        return
      }
      if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
        toast({ title: 'Invalid recipient', description: 'Please enter a valid EVM address', variant: 'destructive' })
        return
      }
      if (!amount || Number(amount) <= 0) {
        toast({ title: 'Invalid amount', description: 'Please enter a positive amount', variant: 'destructive' })
        return
      }

      const eth = (window as any).ethereum
      if (!eth) {
        toast({ title: 'No wallet provider', description: 'Install MetaMask or Coinbase Wallet', variant: 'destructive' })
        return
      }

      setStatus('sending')

      if (selectedToken === 'ETH') {
        const valueHex = toUnitsHex(amount, tokenMeta.decimals)
        const tx = {
          from: wagmiAddress,
          to: recipient,
          value: valueHex,
        }
        const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [tx] })
        setTxHash(hash)
        setStatus('sent')
        toast({ title: 'Payment sent', description: `Tx: ${hash.slice(0, 10)}…` })
        return
      }

      // ERC20 transfer
      if (!tokenContractAddress || !tokenContractAddress.startsWith('0x') || tokenContractAddress.length !== 42) {
        toast({ title: 'Token contract required', description: 'Provide a valid ERC20 contract address on Base', variant: 'destructive' })
        setStatus('failed')
        return
      }

      const amountHex = toUnitsHex(amount, tokenMeta.decimals)
      const data = encodeErc20Transfer(recipient, amountHex)
      const tx = {
        from: wagmiAddress,
        to: tokenContractAddress,
        data,
        value: '0x0',
      }
      const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [tx] })
      setTxHash(hash)
      setStatus('sent')
      toast({ title: 'Token transfer sent', description: `Tx: ${hash.slice(0, 10)}…` })
    } catch (e: any) {
      console.error('Send error:', e)
      setStatus('failed')
      toast({ title: 'Payment failed', description: e?.message || 'Unknown error', variant: 'destructive' })
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'ready': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'sending': return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
      case 'sent': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />
      default: return <Wallet className="h-4 w-4" />
    }
  }

  // Replace init effect: no chainId read or display
  useEffect(() => {
    if (wagmiIsConnected) setStatus('ready')
  }, [wagmiIsConnected])

  return (
    <>
    <main className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <Card className="nm-flat">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Image src="/Base_Logo_0.svg" alt="Base" width={112} height={28} className="h-6 w-auto" style={{ width: 'auto' }} />
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusIcon()}
                  <span className="text-sm text-muted-foreground">
                    {wagmiIsConnected ? `Connected: ${displayAddress}` : 'Not connected'}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Removed Chain ID row */}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Token</label>
                  <Select value={selectedToken} onValueChange={setSelectedToken}>
                    <SelectTrigger className="nm-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOKENS.map((t) => (
                        <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount ({selectedToken})</label>
                  <input
                    className="nm-input"
                    placeholder="0.05"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recipient Address</label>
                <div className="flex items-center space-x-2">
                  <input
                    className="nm-input flex-1"
                    placeholder="0xRecipient..."
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                  {recipient && (
                    <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(recipient)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {!wagmiIsConnected ? (
                  <Button onClick={handleConnect} className="w-full nm-button bg-primary text-primary-foreground">
                    Connect Wallet
                  </Button>
                ) : (
                  <Button onClick={async () => { await disconnectAsync(); setStatus('idle'); toast({ title: 'Wallet disconnected', description: 'You are now disconnected.', progress: 100 }); }} variant="outline" className="w-full">
                    Disconnect
                  </Button>
                )}
                <Button onClick={handleSend} disabled={!wagmiIsConnected || status === 'sending'} className="w-full nm-button bg-accent text-accent-foreground">
                  Send Payment
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>

              {txHash && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Transaction Hash</label>
                  <div className="nm-flat p-3 rounded-lg text-xs font-mono break-all">
                    {txHash}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
    {/* WalletConnectModal not used as connect is programmatic via wagmi */}
    </>
  )
}