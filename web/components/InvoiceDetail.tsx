import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, Copy, Check, ArrowLeft, RefreshCw, FileText } from 'lucide-react';

// 1. Interfaces declared first to ensure predictable layout loading boundaries
interface PaymentStatusHistory {
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'EXPIRED';
  timestamp: string;
  txHash?: string;
}

interface InvoiceData {
  id: string;
  amount: string;
  assetCode: string;
  memo: string;
  destinationAddress: string;
  dueDate: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'EXPIRED';
  history: PaymentStatusHistory[];
}

export const InvoiceDetail: React.FC<{ invoiceId: string; onBack: () => void }> = ({ invoiceId, onBack }) => {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  
  // Localized state tracking ticks to simulate real-time blockchain payments cleanly
  const [simulatedTicks, setSimulatedTicks] = useState<number>(0);

  // 2. Core live status checking synchronization loop
  useEffect(() => {
    const fetchInvoiceStatus = async (isSilent = false) => {
      if (!isSilent) setIsLoading(true);
      else setIsSyncing(true);

      try {
        // --- LIVE BACKEND REPLACEMENT REFERENCE HOOK ---
        // Once APIs go live, replace this simulation block completely with:
        // const response = await axios.get(`/api/invoices/${invoiceId}`);
        // setInvoice(response.data);
        
        await new Promise((resolve) => setTimeout(resolve, 600));
        
        const mockInvoice: InvoiceData = {
          id: invoiceId,
          amount: '250.00',
          assetCode: 'USDC',
          memo: 'REN-48291-INV',
          destinationAddress: 'GBXGQ3V6S52EX733U6NWQY6V6Z7K7SZX4M27N',
          dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString(),
          status: simulatedTicks > 1 ? 'PAID' : 'PENDING',
          history: [
            { status: 'PENDING', timestamp: '2026-06-19 07:00' },
            ...(simulatedTicks > 1 ? [{ status: 'PAID', timestamp: new Date().toLocaleTimeString(), txHash: '0x8f3c4b9a2d1e6f7c8b9a' }] : [])
          ]
        };
        setInvoice(mockInvoice);
      } catch (error) {
        console.error('Invoice synchronization anomaly detected:', error);
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    };

    fetchInvoiceStatus();

    // Constant evaluation polling handler matching safe prefer-const guidelines
    const timerId = setInterval(() => {
      if (invoice?.status !== 'PAID' && invoice?.status !== 'EXPIRED') {
        fetchInvoiceStatus(true);
        setSimulatedTicks((prev) => prev + 1);
      }
    }, 4000);

    return () => clearInterval(timerId);
  }, [invoiceId, invoice?.status, simulatedTicks]);

  // 3. Data clip-capture action utility mapping
  const handleCopyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'PROCESSING': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'EXPIRED': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  if (isLoading || !invoice) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Top Controller Bar Layout */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <button onClick={onBack} className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </button>
        <div className="flex items-center text-xs text-slate-400">
          {isSyncing && <RefreshCw className="mr-1.5 h-3 w-3 animate-spin text-indigo-500" />}
          Live Status Listening Active
        </div>
      </div>

      {/* Main Total Callout Area */}
      <div className="mb-8 flex flex-col items-center justify-center rounded-lg bg-slate-50 p-6 text-center border border-slate-100">
        <FileText className="mb-2 h-8 w-8 text-slate-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Invoice Amount</span>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900">
          {invoice.amount} <span className="text-indigo-600 font-medium text-2xl">{invoice.assetCode}</span>
        </h1>
        <div className={`mt-3 flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${getStatusStyle(invoice.status)}`}>
          {invoice.status === 'PAID' ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : <Clock className="mr-1 h-3.5 w-3.5 animate-pulse" />}
          Invoice Status: {invoice.status}
        </div>
      </div>

      {/* Shareable Metadata Copy Blocks */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold tracking-wide text-slate-800 uppercase">Payment Routing Metadata</h3>
        
        {/* Destination Address Field Layout */}
        <div className="rounded-lg border border-slate-200 p-3 bg-white hover:border-slate-300 transition">
          <div className="flex justify-between text-xs font-medium text-slate-400">Destination Address</div>
          <div className="mt-1 flex items-center justify-between">
            <code className="text-sm font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded break-all">{invoice.destinationAddress}</code>
            <button 
              onClick={() => handleCopyToClipboard(invoice.destinationAddress, 'addr')}
              className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              {copiedField === 'addr' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Payment Memo Field Layout */}
        <div className="rounded-lg border border-slate-200 p-3 bg-white hover:border-slate-300 transition">
          <div className="flex justify-between text-xs font-medium text-slate-400">Transaction Memo (Required)</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">{invoice.memo}</span>
            <button 
              onClick={() => handleCopyToClipboard(invoice.memo, 'memo')}
              className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              {copiedField === 'memo' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Date Expiry Parameters Layout */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 p-3 bg-white">
            <div className="text-xs font-medium text-slate-400">Invoice ID Reference</div>
            <div className="mt-1 text-sm font-medium text-slate-800 truncate">{invoice.id}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-white">
            <div className="text-xs font-medium text-slate-400">Payment Due Window</div>
            <div className="mt-1 text-sm font-medium text-rose-600 font-semibold">{invoice.dueDate}</div>
          </div>
        </div>
      </div>

      {/* Live State Processing History Audit Trail */}
      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="mb-4 text-sm font-bold tracking-wide text-slate-800 uppercase">Payment Lifecycle History</h3>
        <div className="relative border-l-2 border-slate-100 pl-4 space-y-4">
          {invoice.history.map((evt, idx) => (
            <div key={idx} className="relative">
              <div className={`absolute -left-[25px] top-1 h-3 w-3 rounded-full border-2 bg-white ${evt.status === 'PAID' ? 'border-emerald-500' : 'border-blue-500'}`} />
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Lifecycle Phase: {evt.status}</span>
                <span className="text-slate-400">{evt.timestamp}</span>
              </div>
              {evt.txHash && (
                <div className="mt-1 text-xs font-mono text-indigo-500 hover:underline cursor-pointer">
                  Ledger Tx: {evt.txHash}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};