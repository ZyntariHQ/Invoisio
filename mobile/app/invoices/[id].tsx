import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { API_URL } from "@env";
import { useAuthStore } from "../../hooks/use-auth-store";
import { useConnectivity } from "../../hooks/use-connectivity";
import { useInvoiceLive } from "../../hooks/use-invoice-live";
import type { Invoice } from "../../lib/invoices";
import {
  buildInvoiceShareMessage,
  generatePaymentUri,
  getInvoiceAsset,
  getInvoiceDestination,
  getInvoiceMemoType,
} from "../../lib/payment-link";
import { generateDeepLink, generateWebUrl } from "../../lib/share-links";
import { InvoiceLiveStatusBadge } from "../../components/InvoiceLiveStatusBadge";

const POLL_FALLBACK_INTERVAL_MS = 15000;

export default function InvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { isOffline } = useConnectivity();
  const {
    status: liveStatus,
    lastEventAt,
    shouldPoll,
  } = useInvoiceLive(id.length > 0 ? id : undefined);

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } =
    useQuery<Invoice>({
      queryKey: ["invoice", id, accessToken, isOffline],
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
      refetchInterval:
        !isOffline && shouldPoll ? POLL_FALLBACK_INTERVAL_MS : false,
      refetchIntervalInBackground: false,
    });

  // A matching realtime event is a signal the server-side status changed;
  // refetch the full invoice rather than trusting the event payload alone.
  useEffect(() => {
    if (lastEventAt !== null) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a new event arrives
  }, [lastEventAt]);

  // Announce meaningful status transitions (e.g. a payment moving to paid)
  // instead of relying on the badge/colour change alone.
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const current = data?.status;
    if (current !== undefined && prevStatusRef.current !== current) {
      const previous = prevStatusRef.current;
      prevStatusRef.current = current;
      if (previous !== undefined) {
        AccessibilityInfo.announceForAccessibility(
          `Invoice status: ${current.replace(/_/g, " ")}`,
        );
      }
    }
  }, [data?.status]);

  const invoice = data;
  const created = invoice
    ? new Date(invoice.createdAt).toLocaleString()
    : undefined;
  const assetCode = invoice ? getInvoiceAsset(invoice) : undefined;
  const destination = invoice ? getInvoiceDestination(invoice) : undefined;
  const paymentUri =
    invoice && destination
      ? generatePaymentUri({
          amount: String(invoice.amount),
          destination,
          ...(assetCode !== undefined && { assetCode }),
          ...(invoice.asset_issuer !== undefined && {
            assetIssuer: invoice.asset_issuer,
          }),
          ...(invoice.memo !== undefined && { memo: invoice.memo }),
          memoType: getInvoiceMemoType(invoice),
        })
      : undefined;

  // Updated share handler with deep links
  const handleShare = async () => {
    if (!invoice) {
      return;
    }

    try {
      // Generate deep links for the invoice
      const deepLink = generateDeepLink("invoice", invoice.id);
      const webUrl = generateWebUrl("invoice", invoice.id);

      const shareMessage = buildInvoiceShareMessage(invoice);
      const shareContent = {
        title: invoice.invoiceNumber ?? invoice.id,
        message: `${shareMessage}\n\n📱 Open in app: ${deepLink}\n🌐 Web: ${webUrl}`,
      };

      await Share.share(shareContent);
    } catch (error) {
      console.error("Invoice share failed", error);
      Alert.alert(
        "Share unavailable",
        "We couldn't open the native share sheet for this invoice.",
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor="#7dd3fc"
          />
        }
      >
        <View className="px-6 pt-10">
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
            <Pressable
              className="flex-1 rounded-2xl bg-[#2663FF] px-4 py-3"
              accessibilityRole="button"
              accessibilityState={{ disabled: !invoice }}
              disabled={!invoice}
              onPress={() => {
                void handleShare();
              }}
            >
              <Text
                className="text-center text-white"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                Share invoice
              </Text>
            </Pressable>
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <InvoiceLiveStatusBadge
              status={liveStatus}
              {...(dataUpdatedAt > 0 ? { updatedAt: dataUpdatedAt } : {})}
            />
            <Pressable
              className="rounded-full border border-white/15 px-3 py-1.5"
              accessibilityRole="button"
              accessibilityState={{ disabled: isFetching }}
              disabled={isFetching}
              onPress={() => {
                void refetch();
              }}
            >
              <Text
                className={isFetching ? "text-slate-500" : "text-slate-200"}
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                {isFetching ? "Refreshing…" : "↻ Refresh"}
              </Text>
            </Pressable>
          </View>
          {invoice &&
          (invoice.status === "paid" || invoice.status === "partially_paid") ? (
            <Pressable
              accessibilityRole="button"
              className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3"
              onPress={() => {
                router.push(`/receipts/${invoice.id}`);
              }}
            >
              <Text
                className="text-center text-emerald-300"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                🧾 View payment receipt
              </Text>
            </Pressable>
          ) : null}
          {isLoading ? (
            <View className="h-32 animate-pulse rounded-2xl bg-white/10" />
          ) : invoice ? (
            <View className="gap-4">
              <View className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <Text
                  className="text-sm text-slate-400"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  {invoice.invoiceNumber ?? invoice.id}
                </Text>
                <Text
                  className="mt-1 text-2xl text-white"
                  style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                >
                  {invoice.clientName ?? "Invoice"}
                </Text>
                <View className="mt-3 flex-row justify-between">
                  <View>
                    <Text
                      className="text-slate-400"
                      style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                    >
                      Amount
                    </Text>
                    <Text
                      className="text-lg text-white"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {invoice.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {assetCode ?? "XLM"}
                    </Text>
                  </View>
                  <View>
                    <Text
                      className="text-slate-400"
                      style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                    >
                      Status
                    </Text>
                    <Text
                      className={`text-lg ${
                        invoice.status === "pending"
                          ? "text-yellow-300"
                          : invoice.status === "paid"
                            ? "text-emerald-300"
                            : invoice.status === "partially_paid"
                              ? "text-sky-300"
                              : "text-red-300"
                      }`}
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {invoice.status}
                    </Text>
                  </View>
                </View>
                <View className="mt-3">
                  <Text
                    className="text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  >
                    Created
                  </Text>
                  <Text
                    className="text-white"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {created}
                  </Text>
                </View>
                {invoice.description && (
                  <View className="mt-3">
                    <Text
                      className="text-slate-400"
                      style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                    >
                      Description
                    </Text>
                    <Text
                      className="text-white"
                      style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                    >
                      {invoice.description}
                    </Text>
                  </View>
                )}
              </View>

              <View className="rounded-[28px] border border-[#7dd3fc]/20 bg-[#081121] p-5">
                <Text
                  className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Share-ready payment card
                </Text>
                <Text
                  className="mt-2 text-2xl text-white"
                  style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                >
                  Payment instructions
                </Text>
                <Text
                  className="mt-2 text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  Use the native share sheet or send a screenshot of this card.
                </Text>

                <View className="mt-5 gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <DetailRow
                    label="Amount"
                    value={`${invoice.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })} ${assetCode ?? "XLM"}`}
                  />
                  <DetailRow
                    label="Destination"
                    value={destination ?? "Unavailable"}
                    mono
                  />
                  <DetailRow
                    label="Memo"
                    value={invoice.memo ?? "Unavailable"}
                    mono
                  />
                  {invoice.description ? (
                    <DetailRow label="Context" value={invoice.description} />
                  ) : null}
                </View>

                <View className="mt-4 rounded-3xl border border-dashed border-white/15 bg-black/20 p-4">
                  <Text
                    className="text-xs uppercase tracking-[0.24em] text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    Payment link
                  </Text>
                  <Text
                    selectable
                    className="mt-2 text-sm text-white"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {paymentUri ??
                      "Destination is required before we can generate a wallet link."}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <Text
              className="text-slate-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Invoice not found
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
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
