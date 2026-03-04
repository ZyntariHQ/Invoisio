import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInvoices } from "../utils/api";
import { useMemo, useState } from "react";

const SkeletonCard = () => (
  <View className="mb-4 flex-row items-center justify-between px-4 py-4 border-white/5 opacity-50">
    <View className="gap-2">
      <View className="h-4 w-20 rounded bg-slate-700" />
      <View className="h-6 w-32 rounded bg-slate-600" />
    </View>
    <View className="items-end gap-2">
      <View className="h-5 w-24 rounded bg-slate-600" />
      <View className="h-4 w-16 rounded bg-slate-700" />
    </View>
  </View>
);

const StatusBadge = ({ status }: { status: string }) => {
  let color = "text-slate-400";
  let bg = "bg-slate-400/10";
  let label = status.charAt(0).toUpperCase() + status.slice(1);

  switch (status) {
    case "pending":
      color = "text-yellow-400";
      bg = "bg-yellow-400/10";
      break;
    case "paid":
      color = "text-emerald-400";
      bg = "bg-emerald-400/10";
      break;
    case "overdue":
    case "cancelled":
      color = "text-rose-400";
      bg = "bg-rose-400/10";
      break;
  }

  return (
    <View className={`rounded-full px-2 py-0.5 ${bg}`}>
      <Text className={`text-xs font-medium ${color}`}>{label}</Text>
    </View>
  );
};

export default function DashboardScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isRefetching } = useInvoices(
    page,
    10,
  );

  const formatCurrency = (amount: number, asset: string) => {
    return new Intl.NumberFormat("en-US", {
      style: asset === "XLM" ? "decimal" : "currency",
      currency: "USD",
    }).format(amount);
  };

  const metrics = useMemo(() => {
    if (!data?.meta) return [];
    return [
      {
        label: "Outstanding",
        value: `$${(data.meta.totalPending / 1000).toFixed(0)}k`,
        delta: "Pending",
      },
      {
        label: "Total Paid",
        value: `$${(data.meta.totalPaid / 1000).toFixed(0)}k`,
        delta: "Collected",
      },
      {
        label: "Active Count",
        value: data.meta.totalCount.toString(),
        delta: "Invoices",
      },
    ];
  }, [data]);

  const invoices = data?.data || [];

  const handleRefresh = () => {
    setPage(1);
    refetch();
  };

  if (isError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-brand-background px-6">
        <Text className="text-center text-xl text-white">
          Failed to load invoices
        </Text>
        <Pressable
          onPress={handleRefresh}
          className="mt-4 rounded-xl bg-white/10 px-6 py-3"
        >
          <Text className="text-white">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor="#7dd3fc"
          />
        }
      >
        <View className="px-6 pt-10">
          <Text
            className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Operator overview
          </Text>
          <Text
            className="mt-2 text-4xl leading-tight text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Base-native receivables in one glass dashboard.
          </Text>
          <Text
            className="mt-2 text-base text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Monitor liquidity, financing pipelines, and live settlement metrics
            in real time.
          </Text>
        </View>

        <FlatList
          data={(isLoading ? [1, 2, 3] : metrics) as any[]}
          keyExtractor={(item, index) =>
            typeof item === "number" ? index.toString() : item.label
          }
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingVertical: 20,
            gap: 16,
          }}
          renderItem={({ item }) =>
            isLoading ? (
              <View className="w-64 rounded-3xl bg-white/5 p-5">
                <View className="h-4 w-20 rounded bg-slate-700" />
                <View className="mt-3 h-8 w-32 rounded bg-slate-600" />
                <View className="mt-1 h-4 w-16 rounded bg-slate-700" />
              </View>
            ) : (
              <LinearGradient
                colors={["#111C36", "#0F172A"]}
                className="w-64 rounded-3xl p-5"
              >
                <Text
                  className="text-sm text-[#94a3b8]"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  {(item as any).label}
                </Text>
                <Text
                  className="mt-3 text-3xl text-white"
                  style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                >
                  {(item as any).value}
                </Text>
                <Text
                  className="mt-1 text-sm text-emerald-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  {(item as any).delta}
                </Text>
              </LinearGradient>
            )
          }
        />

        <View className="px-6">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-lg text-white"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              Active invoices
            </Text>
            <Link href="/create-invoice" asChild>
              <Pressable className="rounded-2xl border border-white/20 px-4 py-2">
                <Text
                  className="text-white"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  New invoice
                </Text>
              </Pressable>
            </Link>
          </View>

          <View className="mt-4 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : invoices.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-slate-400">No invoices found</Text>
              </View>
            ) : (
              invoices.map((invoice, index) => (
                <Pressable
                  key={invoice.id}
                  onPress={() => router.push(`/invoice-details?id=${invoice.id}`)}
                  className="flex-row items-center justify-between px-4 py-4 border-white/5 active:bg-white/5"
                  style={{
                    borderBottomWidth: index === invoices.length - 1 ? 0 : 1,
                  }}
                >
                  <View>
                    <Text
                      className="text-sm text-slate-400"
                      style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                    >
                      {invoice.invoiceNumber}
                    </Text>
                    <Text
                      className="text-xl text-white"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                      numberOfLines={1}
                    >
                      {invoice.clientName}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      className="text-lg text-white"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {formatCurrency(invoice.amount, invoice.asset_code)}{" "}
                      <Text className="text-xs text-slate-400">
                        {invoice.asset_code}
                      </Text>
                    </Text>
                    <View className="mt-1">
                      <StatusBadge status={invoice.status} />
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </View>

          {data?.meta && data.meta.totalCount > data.meta.limit && (
            <View className="mt-4 flex-row items-center justify-between">
              <Pressable
                disabled={page === 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                className={`rounded-xl border border-white/10 px-4 py-2 ${page === 1 ? "opacity-30" : "active:bg-white/5"}`}
              >
                <Text className="text-white">Previous</Text>
              </Pressable>
              <Text className="text-slate-400">
                Page {page} of {Math.ceil(data.meta.totalCount / data.meta.limit)}
              </Text>
              <Pressable
                disabled={page >= Math.ceil(data.meta.totalCount / data.meta.limit)}
                onPress={() => setPage((p) => p + 1)}
                className={`rounded-xl border border-white/10 px-4 py-2 ${page >= Math.ceil(data.meta.totalCount / data.meta.limit) ? "opacity-30" : "active:bg-white/5"}`}
              >
                <Text className="text-white">Next</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View className="mt-10 px-6">
          <LinearGradient
            colors={["#1b1f3b", "#1c2c4a"]}
            className="rounded-3xl p-6"
          >
            <Text
              className="text-base uppercase tracking-[0.3em] text-[#7dd3fc]"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Cashflow automations
            </Text>
            <Text
              className="mt-3 text-3xl text-white"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              Route settlements to any wallet, treasury, or custodian.
            </Text>
            <Text
              className="mt-3 text-slate-200"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Define payout rules that net profit share, protocol fees, and
              vendor yield in one ledgered flow.
            </Text>
            <Link href="/create-invoice" asChild>
              <Pressable className="mt-5 rounded-2xl bg-white px-4 py-3">
                <Text
                  className="text-center text-base text-[#050914]"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Configure routes
                </Text>
              </Pressable>
            </Link>
          </LinearGradient>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
