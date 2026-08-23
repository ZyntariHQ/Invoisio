import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_URL } from "@env";
import { useAuthStore } from "../../hooks/use-auth-store";
import type { Invoice, PaymentRecord } from "../../lib/invoices";
import { getInvoiceAsset, getInvoiceDestination } from "../../lib/payment-link";
import {
  exportReceiptAsPdf,
  shareReceiptAsText,
} from "../../lib/receipt-export";
import type { ExportError } from "../../lib/receipt-export";

/** How often to re-check the invoice while settlement is still in flight. */
const SETTLEMENT_POLL_MS = 5000;

function formatAmount(value: number | undefined, assetCode: string): string {
  const amount = (value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return `${amount} ${assetCode}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function statusStyle(status: Invoice["status"]): {
  label: string;
  textClass: string;
  bgClass: string;
} {
  switch (status) {
    case "paid":
      return {
        label: "Paid",
        textClass: "text-emerald-300",
        bgClass: "bg-emerald-500/20",
      };
    case "partially_paid":
      return {
        label: "Partially paid",
        textClass: "text-sky-300",
        bgClass: "bg-sky-500/20",
      };
    case "pending":
      return {
        label: "Pending",
        textClass: "text-yellow-300",
        bgClass: "bg-yellow-500/20",
      };
    case "overdue":
      return {
        label: "Overdue",
        textClass: "text-red-300",
        bgClass: "bg-red-500/20",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        textClass: "text-slate-300",
        bgClass: "bg-slate-500/20",
      };
    default:
      return {
        label: status,
        textClass: "text-slate-300",
        bgClass: "bg-slate-500/20",
      };
  }
}

/**
 * Human-readable recovery guidance for each error type.
 * Shown via Alert so the merchant always knows what to do next.
 */
function exportErrorAlert(error: ExportError): void {
  const guidance: Record<
    ExportError,
    { title: string; message: string }
  > = {
    SHARE_DISMISSED: {
      title: "Share cancelled",
      message: "You closed the share sheet. Tap the share button again whenever you're ready.",
    },
    SHARE_UNAVAILABLE: {
      title: "Sharing not available",
      message:
        "Your device does not support the native share sheet right now.\n\n" +
        "Try: checking that your device has at least one share target installed " +
        "(e.g. Mail, Messages, or a cloud-storage app) then try again.\n\n" +
        "As an alternative you can copy the transaction hash shown on screen and " +
        "paste it into any app.",
    },
    PDF_RENDER_FAILED: {
      title: "PDF could not be created",
      message:
        "The PDF renderer encountered an error.\n\n" +
        "Try: restarting the app. If the problem continues, use 'Share as text' " +
        "which works without any additional modules.",
    },
    UNKNOWN: {
      title: "Export failed",
      message:
        "Something unexpected went wrong while preparing the receipt.\n\n" +
        "Try: closing and reopening the receipt, then tap the export button " +
        "again. If the issue persists, use 'Share as text' instead.",
    },
  };

  const { title, message } = guidance[error];
  Alert.alert(title, message, [{ text: "OK" }]);
}

export default function ReceiptScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [sharingText, setSharingText] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data, isLoading } = useQuery<Invoice>({
    queryKey: ["receipt", id, accessToken],
    queryFn: async () => {
      const headers =
        accessToken != null
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined;
      const res = await axios.get(
        `${API_URL}/invoices/${id}`,
        headers ? { headers } : undefined,
      );
      return res.data as Invoice;
    },
    enabled: typeof id === "string" && id.length > 0,
    // Keep refreshing while the payment is still settling so the receipt
    // reflects a confirmed proof of payment as soon as it lands.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "partially_paid"
        ? SETTLEMENT_POLL_MS
        : false;
    },
  });

  // Announce settlement transitions (e.g. payment received -> paid) instead
  // of relying on the status chip/colour change alone.
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const current = data?.status;
    if (current !== undefined && prevStatusRef.current !== current) {
      const previous = prevStatusRef.current;
      prevStatusRef.current = current;
      if (previous !== undefined) {
        AccessibilityInfo.announceForAccessibility(
          `Payment status: ${current.replace(/_/g, " ")}`,
        );
      }
    }
  }, [data?.status]);

  const invoice = data;
  const assetCode = invoice ? getInvoiceAsset(invoice) : "XLM";
  const destination = invoice ? getInvoiceDestination(invoice) : undefined;
  const status = invoice ? statusStyle(invoice.status) : undefined;
  const payments: PaymentRecord[] = invoice?.payments ?? [];
  const hasExplicitPayments = payments.length > 0;
  const txHash = invoice?.tx_hash ?? payments[0]?.txHash;

  // ── share as text ────────────────────────────────────────────────────────

  const handleShareText = async () => {
    if (!invoice || sharingText) return;

    setSharingText(true);
    try {
      const result = await shareReceiptAsText(invoice);
      if (!result.success) {
        exportErrorAlert(result.error);
      }
    } catch {
      exportErrorAlert("UNKNOWN");
    } finally {
      setSharingText(false);
    }
  };

  // ── export as PDF ─────────────────────────────────────────────────────────

  const handleExportPdf = async () => {
    if (!invoice || exportingPdf) return;

    setExportingPdf(true);
    try {
      const result = await exportReceiptAsPdf(invoice);
      if (result.success && "fallback" in result && result.fallback) {
        // expo-print / expo-sharing not installed — we already fell back to
        // text share; let the merchant know so they can install the packages.
        Alert.alert(
          "PDF sharing unavailable",
          "The PDF export module is not installed on this build.\n\n" +
            "To enable PDF export run:\n  npx expo install expo-print expo-sharing\n\n" +
            "Your receipt has been shared as text instead.",
          [{ text: "OK" }],
        );
      } else if (!result.success) {
        exportErrorAlert(result.error);
      }
    } catch {
      exportErrorAlert("UNKNOWN");
    } finally {
      setExportingPdf(false);
    }
  };

  const isExporting = sharingText || exportingPdf;

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-6 pt-10">
          {/* ── navigation row ─────────────────────────────────────────── */}
          <View className="mb-4 flex-row gap-3">
            <Pressable
              className="flex-1 rounded-2xl border border-white/20 px-4 py-3"
              accessibilityRole="button"
              onPress={() => {
                router.back();
              }}
            >
              <Text
                className="text-center text-white"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Back
              </Text>
            </Pressable>
            {invoice ? (
              <Pressable
                className="flex-1 rounded-2xl bg-[#2663FF] px-4 py-3"
                accessibilityRole="button"
                onPress={() => {
                  router.push(`/invoices/${invoice.id}`);
                }}
              >
                <Text
                  className="text-center text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  View invoice
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* ── export / share action row ───────────────────────────────── */}
          {invoice ? (
            <View className="mb-4 gap-3">
              {/* Share as text — always available */}
              <Pressable
                className={`flex-row items-center justify-center gap-2 rounded-2xl border border-[#2663FF]/60 bg-[#2663FF]/15 px-4 py-3 ${
                  isExporting ? "opacity-60" : ""
                }`}
                disabled={isExporting}
                onPress={() => {
                  void handleShareText();
                }}
                accessibilityLabel="Share receipt as text"
                accessibilityRole="button"
                accessibilityState={{ disabled: isExporting }}
              >
                {sharingText ? (
                  <ActivityIndicator color="#7dd3fc" size="small" />
                ) : (
                  <Text
                    className="text-base text-[#7dd3fc]"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    📤
                  </Text>
                )}
                <Text
                  className="text-center text-[#7dd3fc]"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Share receipt
                </Text>
              </Pressable>

              {/* Export as PDF */}
              <Pressable
                className={`flex-row items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 ${
                  isExporting ? "opacity-60" : ""
                }`}
                disabled={isExporting}
                onPress={() => {
                  void handleExportPdf();
                }}
                accessibilityLabel="Export receipt as PDF"
                accessibilityRole="button"
                accessibilityState={{ disabled: isExporting }}
              >
                {exportingPdf ? (
                  <ActivityIndicator color="#34d399" size="small" />
                ) : (
                  <Text
                    className="text-base text-emerald-300"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    📄
                  </Text>
                )}
                <Text
                  className="text-center text-emerald-300"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Export as PDF
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View className="h-32 animate-pulse rounded-2xl bg-white/10" />
          ) : invoice ? (
            <View className="gap-4">
              {/* Receipt header */}
              <View className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <Text
                  className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Payment receipt
                </Text>
                <Text
                  className="mt-2 text-2xl text-white"
                  style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                >
                  {invoice.invoiceNumber ?? invoice.id}
                </Text>
                <Text
                  className="mt-1 text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  {invoice.clientName ?? "Invoice"}
                </Text>
                {status ? (
                  <View
                    className={`mt-4 self-start rounded-full px-3 py-1 ${status.bgClass}`}
                  >
                    <Text
                      className={`text-sm ${status.textClass}`}
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {status.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Confirmation summary */}
              <View className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <Text
                  className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Settlement
                </Text>
                <View className="mt-4 gap-3">
                  <ReceiptRow
                    label="Amount"
                    value={formatAmount(invoice.amount, assetCode)}
                  />
                  <ReceiptRow
                    label="Amount paid"
                    value={formatAmount(
                      invoice.amountPaid ??
                        (invoice.status === "paid" ? invoice.amount : 0),
                      assetCode,
                    )}
                  />
                  <ReceiptRow
                    label="Amount due"
                    value={formatAmount(invoice.amountDue ?? 0, assetCode)}
                  />
                  <ReceiptRow
                    label="Asset"
                    value={
                      invoice.asset_issuer
                        ? `${assetCode} (${invoice.asset_issuer})`
                        : assetCode
                    }
                  />
                  {destination ? (
                    <ReceiptRow label="Destination" value={destination} mono />
                  ) : null}
                  <ReceiptRow
                    label="Memo"
                    value={invoice.memo ?? "Unavailable"}
                    mono
                  />
                  <ReceiptRow
                    label="Created"
                    value={formatDate(invoice.createdAt)}
                  />
                  {invoice.dueDate ? (
                    <ReceiptRow
                      label="Due date"
                      value={formatDate(invoice.dueDate)}
                    />
                  ) : null}
                </View>
              </View>

              {/* Proof of payment: transaction hash(es) */}
              {(txHash || hasExplicitPayments) && (
                <View className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-5">
                  <Text
                    className="text-sm uppercase tracking-[0.3em] text-emerald-300"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    Proof of payment
                  </Text>

                  {txHash ? (
                    <View className="mt-3 gap-1">
                      <Text
                        className="text-xs uppercase tracking-[0.22em] text-slate-400"
                        style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                      >
                        Transaction hash
                      </Text>
                      <Text
                        selectable
                        className="text-sm text-emerald-100"
                        style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                      >
                        {txHash}
                      </Text>
                    </View>
                  ) : null}

                  {hasExplicitPayments ? (
                    <View className="mt-4 gap-2">
                      {payments.map((payment) => (
                        <View
                          key={payment.id}
                          className="rounded-2xl border border-white/10 bg-black/20 p-3"
                        >
                          <View className="flex-row items-center justify-between">
                            <Text
                              className="text-white"
                              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                            >
                              {formatAmount(payment.amount, assetCode)}
                            </Text>
                            <Text
                              className="text-xs text-slate-400"
                              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                            >
                              {formatDate(payment.createdAt)}
                            </Text>
                          </View>
                          {payment.txHash ? (
                            <Text
                              selectable
                              className="mt-2 text-xs text-slate-300"
                              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                            >
                              {payment.txHash}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Text
                    className="mt-4 text-xs text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  >
                    Confirm this transaction on the Stellar network to verify
                    the payment was received.
                  </Text>
                </View>
              )}

              {/* Export hint */}
              <View className="rounded-2xl border border-white/5 bg-white/3 px-4 py-3">
                <Text
                  className="text-center text-xs text-slate-500"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  Use the buttons above to share this receipt or export it as a
                  PDF for your records.
                </Text>
              </View>
            </View>
          ) : (
            <Text
              className="text-slate-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Receipt not found
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="gap-1">
      <Text
        className="text-xs uppercase tracking-[0.22em] text-slate-400"
        style={{ fontFamily: "SpaceGrotesk_500Medium" }}
      >
        {label}
      </Text>
      <Text
        className="text-base text-white"
        style={{
          fontFamily: mono
            ? "SpaceGrotesk_500Medium"
            : "SpaceGrotesk_400Regular",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
