import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlatList,
  Pressable,
  Text,
  View,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWalletAuth } from "../hooks/use-wallet-auth";
import { useInvoicesList, Invoice } from "../lib/invoices";
import { useMemo } from "react";

export default function DashboardScreen() {
  const router = useRouter();
  const { publicKey, disconnectWallet } = useWalletAuth();
  const { data, isLoading, isFetching, refetch, hasNextPage, fetchNextPage } =
    useInvoicesList(20);

  const invoices: Invoice[] = useMemo(() => {
    return (data?.pages ?? []).flatMap((p) => p.items);
  }, [data]);

  const totals = useMemo(() => {
    const pending = invoices
      .filter((i) => i.status === "pending")
      .reduce(
        (sum, i) => sum + (typeof i.amount === "number" ? i.amount : 0),
        0,
      );
    const paid = invoices
      .filter((i) => i.status === "paid")
      .reduce(
        (sum, i) => sum + (typeof i.amount === "number" ? i.amount : 0),
        0,
      );
    return { pending, paid };
  }, [invoices]);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          disconnectWallet()
            .then(() => {
              router.replace("/login");
            })
            .catch((err: unknown) => {
              console.error("Logout error:", err);
            });
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View className="px-6 pt-10">
            <View className="flex-row items-center justify-between">
              <View>
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
              </View>
              <Pressable
                className="rounded-2xl border border-red-500/30 px-4 py-2"
                onPress={handleLogout}
              >
                <Text
                  className="text-sm text-red-400"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Logout
                </Text>
              </Pressable>
            </View>
            {publicKey && (
              <Text
                className="mt-2 text-xs text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Connected: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
              </Text>
            )}
            <Text
              className="mt-2 text-base text-slate-300"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Monitor liquidity, financing pipelines, and live settlement
              metrics in real time.
            </Text>

            <FlatList
              data={[
                {
                  label: "Total Pending Amount",
                  value:
                    totals.pending > 0
                      ? `$${totals.pending.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}`
                      : "$0",
                },
                {
                  label: "Total Paid",
                  value:
                    totals.paid > 0
                      ? `$${totals.paid.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}`
                      : "$0",
                },
              ]}
              keyExtractor={(item) => item.label}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingVertical: 20,
                gap: 16,
              }}
              renderItem={({ item }) => (
                <LinearGradient
                  colors={["#111C36", "#0F172A"]}
                  className="w-64 rounded-3xl p-5"
                >
                  <Text
                    className="text-sm text-[#94a3b8]"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    className="mt-3 text-3xl text-white"
                    style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                  >
                    {item.value}
                  </Text>
                </LinearGradient>
              )}
            />

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
          </View>
        }
        renderItem={({ item }) => {
          const created = new Date(item.createdAt).toLocaleDateString();
          const statusBg =
            item.status === "pending"
              ? "bg-yellow-500/20"
              : item.status === "paid"
                ? "bg-emerald-500/20"
                : "bg-red-500/20";
          const statusText =
            item.status === "pending"
              ? "text-yellow-300"
              : item.status === "paid"
                ? "text-emerald-300"
                : "text-red-300";
          return (
            <Pressable
              className="mx-6 my-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
              onPress={() => {
                router.push(`/invoices/${item.id}`);
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text
                    className="text-sm text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {item.invoiceNumber ?? item.id}
                  </Text>
                  <Text
                    className="mt-1 text-xl text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    numberOfLines={1}
                  >
                    {item.clientName ?? "Invoice"}
                  </Text>
                  <Text
                    className="mt-1 text-xs text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  >
                    {created}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-lg text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    $
                    {item.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                  <Text
                    className="text-xs text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  >
                    {item.asset}
                  </Text>
                  <View className={`mt-2 rounded-full px-2 py-1 ${statusBg}`}>
                    <Text
                      className={`text-xs ${statusText}`}
                      style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                    >
                      {item.status === "pending"
                        ? "Pending"
                        : item.status === "paid"
                          ? "Paid"
                          : "Expired"}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View className="px-6">
              {Array.from({ length: 3 }).map((_, idx) => (
                <View
                  key={idx}
                  className="my-2 h-20 animate-pulse rounded-2xl bg-white/10"
                />
              ))}
            </View>
          ) : (
            <View className="px-6 py-12 items-center">
              <Text
                className="text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                No invoices found
              </Text>
              <Link href="/create-invoice" asChild>
                <Pressable className="mt-4 rounded-2xl border border-white/20 px-4 py-2">
                  <Text
                    className="text-white"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    Create invoice
                  </Text>
                </Pressable>
              </Link>
            </View>
          )
        }
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (hasNextPage && !isFetching) {
            void fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            tintColor="#E2E8F0"
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </SafeAreaView>
  );
}
