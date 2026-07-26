"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import {
  generatePaymentUri,
  openPaymentWallet,
  getWalletInfo,
} from "@/lib/sep0007";
import { PublicInvoiceService } from "@/lib/public-invoice-service";
import { usePollInvoiceStatus } from "@/hooks/use-poll-invoice-status";

interface WalletInfo {
  hasWallet: boolean;
  isMobile: boolean;
  isFreighter: boolean;
  message: string;
}

export default function PublicPayerPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params?.id as string;

  const [walletInfo] = useState<WalletInfo | null>(getWalletInfo());
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchInvoice = useCallback(async (id: string) => {
    return await PublicInvoiceService.getInvoice(id);
  }, []);

  const {
    invoice,
    isLoading,
    error: pollError,
    lastUpdated,
    refreshStatus,
  } = usePollInvoiceStatus(invoiceId, fetchInvoice);

  const handleCopyToClipboard = useCallback(
    async (text: string, field: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        window.setTimeout(() => setCopiedField(null), 2000);
      } catch (err) {
        console.error("Copy failed", err);
      }
    },
    [],
  );

  const formatDateTime = useCallback((value: string | Date | null) => {
    if (!value) return "Unavailable";
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "Unavailable";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const handlePayClick = useCallback(async () => {
    if (!invoice || paymentInProgress) return;

    try {
      setPaymentInProgress(true);
      setPaymentError(null);

      const paymentUri = generatePaymentUri({
        destination: invoice.destination_address,
        amount: invoice.amount.toString(),
        assetCode: invoice.asset_code,
        assetIssuer: invoice.asset_issuer,
        memo: invoice.memo,
        memoType: "id",
      });

      await openPaymentWallet(paymentUri);
      setPaymentInProgress(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPaymentError(message);
      setPaymentInProgress(false);
    }
  }, [invoice, paymentInProgress]);

  const statusConfig = useMemo(() => {
    if (!invoice) return { color: "gray", badge: "Unknown", icon: Clock };

    switch (invoice.status) {
      case "paid":
        return { color: "green", badge: "Paid", icon: CheckCircle };
      case "pending":
        return { color: "yellow", badge: "Pending", icon: Clock };
      case "overdue":
        return { color: "red", badge: "Overdue", icon: AlertCircle };
      case "cancelled":
        return { color: "gray", badge: "Cancelled", icon: XCircle };
      default:
        return { color: "gray", badge: invoice.status, icon: Clock };
    }
  }, [invoice]);

  const StatusIcon = statusConfig.icon;

  const qrCodeValue = useMemo(() => {
    if (!invoice) return "";
    return generatePaymentUri({
      destination: invoice.destination_address,
      amount: invoice.amount.toString(),
      assetCode: invoice.asset_code,
      assetIssuer: invoice.asset_issuer,
      memo: invoice.memo,
      memoType: "id",
    });
  }, [invoice]);

  if (isLoading && !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-64 rounded-lg bg-white" />
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-lg bg-white p-8 shadow-lg">
            <XCircle className="mx-auto h-16 w-16 text-red-500" />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Invoice Not Found
            </h1>
            <p className="mt-2 text-gray-600">
              {pollError ||
                "The invoice you are looking for does not exist or has been removed."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const isPending = invoice.status === "pending";
  const isOverdue = invoice.status === "overdue";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header with Merchant Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {invoice.merchantName}
          </h1>
          <p className="mt-2 text-sm text-gray-600">Invoice Payment</p>
        </div>

        {/* Main Card */}
        <div className="overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="px-6 py-8 sm:px-8">
            {/* Status Badge */}
            <div className="mb-6 flex items-center justify-center">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${
                  statusConfig.color === "green"
                    ? "bg-green-100 text-green-800"
                    : statusConfig.color === "yellow"
                      ? "bg-yellow-100 text-yellow-800"
                      : statusConfig.color === "red"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                }`}
              >
                <StatusIcon className="h-5 w-5" />
                <span className="text-sm font-semibold">
                  {statusConfig.badge}
                </span>
              </div>
            </div>

            {/* Amount Display */}
            <div className="mb-8 text-center">
              <p className="text-sm font-medium uppercase text-gray-500">
                Amount Due
              </p>
              <p className="mt-2 text-5xl font-bold text-gray-900">
                {invoice.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}
              </p>
              <p className="mt-2 text-lg text-gray-600">{invoice.asset_code}</p>
            </div>

            {/* Invoice Details */}
            <div className="mb-8 space-y-4 border-t border-gray-200 pt-6">
              {invoice.invoiceNumber && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    Invoice Number
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {invoice.invoiceNumber}
                  </span>
                </div>
              )}

              {invoice.description && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    Description
                  </span>
                  <span className="text-sm text-gray-900 text-right max-w-[60%]">
                    {invoice.description}
                  </span>
                </div>
              )}

              {invoice.dueDate && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    Due Date
                  </span>
                  <span
                    className={`text-sm font-semibold ${isOverdue ? "text-red-600" : "text-gray-900"}`}
                  >
                    {formatDate(invoice.dueDate)}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">
                  Created
                </span>
                <span className="text-sm text-gray-900">
                  {formatDate(invoice.createdAt)}
                </span>
              </div>
            </div>

            {/* Payment Status Messages */}
            {paymentInProgress && (
              <div
                className="mb-6 rounded-md bg-blue-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-blue-900">
                  ⏳ Waiting for payment... Check your wallet for confirmation.
                </p>
              </div>
            )}

            {isPaid && (
              <div
                className="mb-6 rounded-md bg-green-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-green-900">
                  ✓ Payment received successfully! Thank you.
                </p>
              </div>
            )}

            {paymentError && (
              <div
                className="mb-6 rounded-md bg-red-50 p-4"
                role="alert"
                aria-live="assertive"
              >
                <p className="text-sm font-medium text-red-900">
                  Error: {paymentError}
                </p>
              </div>
            )}

            {!walletInfo?.hasWallet && isPending && (
              <div
                className="mb-6 rounded-md bg-amber-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-amber-900">
                  ⚠️ {walletInfo?.message || "No wallet detected"}
                </p>
              </div>
            )}

            {/* QR Code for Payment */}
            {isPending && qrCodeValue && (
              <div className="mb-8 flex flex-col items-center">
                <p className="mb-4 text-sm font-medium uppercase text-gray-500">
                  Scan to Pay
                </p>
                <div className="rounded-lg border-4 border-white bg-white p-4 shadow-lg">
                  <QRCodeSVG
                    value={qrCodeValue}
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Scan with your Stellar wallet
                </p>
              </div>
            )}

            {/* Payment Instructions */}
            {isPending && (
              <div className="mb-8 rounded-md border border-blue-200 bg-blue-50 p-4">
                <p className="mb-3 text-xs font-medium uppercase text-blue-900">
                  Payment Instructions
                </p>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex items-start justify-between gap-3 rounded-md border border-blue-100 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase text-blue-700">
                        Destination
                      </p>
                      <code className="font-mono break-all text-xs text-slate-700">
                        {invoice.destination_address}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyToClipboard(
                          invoice.destination_address,
                          "destination",
                        )
                      }
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copiedField === "destination" ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-3 rounded-md border border-blue-100 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase text-blue-700">
                        Memo
                      </p>
                      <code className="font-mono break-all text-xs text-slate-700">
                        {invoice.memo}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyToClipboard(invoice.memo, "memo")
                      }
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copiedField === "memo" ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="rounded-md border border-blue-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-blue-700">
                      Asset
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {invoice.asset_code}
                      {invoice.asset_issuer && (
                        <>
                          {" "}
                          (Issuer:{" "}
                          <code className="font-mono break-all text-xs">
                            {invoice.asset_issuer}
                          </code>
                          )
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Last Updated */}
            {lastUpdated && (
              <div className="mb-6 text-center text-xs text-gray-500">
                Last updated: {formatDateTime(lastUpdated)}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              {isPending && walletInfo?.hasWallet && (
                <button
                  type="button"
                  onClick={handlePayClick}
                  disabled={paymentInProgress || isLoading}
                  aria-label={
                    paymentInProgress
                      ? "Waiting for payment confirmation"
                      : "Pay invoice via Stellar wallet"
                  }
                  className="w-full rounded-md bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {paymentInProgress
                    ? "⏳ Waiting for Payment..."
                    : "💳 Pay Invoice"}
                </button>
              )}

              <button
                type="button"
                onClick={refreshStatus}
                disabled={isLoading}
                aria-label="Refresh invoice payment status"
                className="w-full rounded-md border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
              >
                🔄 Refresh Status
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            {isPending && walletInfo?.hasWallet
              ? 'Click "Pay Invoice" to open your Stellar wallet and send payment.'
              : isPaid
                ? "Thank you for your payment!"
                : isOverdue
                  ? "This invoice is overdue. Please contact the merchant."
                  : "Unable to process payment at this time."}
          </p>
          <p className="mt-4 text-xs text-gray-500">Powered by Invoisio</p>
        </div>
      </div>
    </div>
  );
}
