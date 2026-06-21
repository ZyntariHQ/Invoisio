import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlatList,
  Pressable,
  Text,
  View,
  Alert,
  RefreshControl,
  AppState,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWalletAuth } from "../hooks/use-wallet-auth";
import { useInvoicesList, Invoice } from "../lib/invoices";
import { useMemo, useEffect, useState, useRef } from "react";
import { getInvoicesLastSynced } from "../lib/cache";
import {
  useInvoiceFilters,
  STATUS_OPTIONS,
} from "../hooks/use-invoice-filters";

/** Debounce delay for search input (ms) */
const DEBOUNCE_MS = 350;

export default function DashboardScreen() {
  const router = useRouter();
  const { publicKey, disconnectWallet } = useWalletAuth();

  // Filter state from zustand store (persists across navigation)
  const {
    search,
    searchDraft,
    status,
    setSearchDraft,
    commitDraft,
    setStatus,
    clearFilters,
  } = useInvoiceFilters();

  // Debounce search commits
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (text: string) => {
    setSearchDraft(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commitDraft();
    }, DEBOUNCE_MS);
  };
  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { data, isLoading, isFetching, refetch, hasNextPage, fetchNextPage } =
    useInvoicesList(20, search, status);

  const [lastSynced, setLastSynced] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ts = await getInvoicesLastSynced();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may be mutated by cleanup
        if (!cancelled) setLastSynced(ts);
      } catch (err) {
        console.error("load lastSynced", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active") {
        void refetch();
        setTimeout(() => {
          void (async () => {
            try {
              const ts = await getInvoicesLastSynced();
              setLastSynced(ts);
            } catch (e) {
              console.warn("refresh lastSynced failed", e);
            }
          })();
        }, 1000);
      }
    });
    return () => {
      sub.remove();
    };
  }, [refetch]);

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

  const hasActiveFilters = search.trim().length > 0 || status !== "all";

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
              <View className="flex-1 pr-3">
                <Text
                  className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Operator overview
                </Text>
                <Text
                  className="mt-2 text-3xl leading-tight text-white"
                  style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                >
                  Base-native receivables in one glass dashboard.
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  className="rounded-2xl border border-white/20 px-3 py-2"
                  onPress={() => {
                    router.push("/settings");
                  }}
                >
                  <Text
                    className="text-sm text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    ⚙️
                  </Text>
                </Pressable>
                <Pressable
                  className="rounded-2xl border border-red-500/30 px-3 py-2"
                  onPress={handleLogout}
                >
                  <Text
                    className="text-sm text-red-400"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    ↗
                  </Text>
                </Pressable>
              </View>
            </View>
            {publicKey && (
              <Text
                className="mt-2 text-xs text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Connected: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
              </Text>
            )}

            {/* Summary cards */}
            <FlatList
              data={[
                {
                  label: "Total Pending Amount",
                  value:
                    totals.pending > 0
                      ? `$${totals.pending.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "$0",
                },
                {
                  label: "Total Paid",
                  value:
                    totals.paid > 0
                      ? `$${totals.paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "$0",
                },
              ]}
              keyExtractor={(item) => item.label}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 20, gap: 16 }}
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

            {/* Search bar */}
            <View className="mt-2 flex-row items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Text className="mr-2 text-base text-slate-400">🔍</Text>
              <TextInput
                className="flex-1 text-base text-white"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                placeholder="Search by invoice #, client name, email..."
                placeholderTextColor="#64748b"
                value={searchDraft}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  commitDraft();
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchDraft.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchDraft("");
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    commitDraft();
                  }}
                >
                  <Text className="text-base text-slate-400">✕</Text>
                </Pressable>
              )}
            </View>

            {/* Status filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
            >
              {STATUS_OPTIONS.map((opt) => {
                const isActive = status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    className={`rounded-full px-4 py-2 ${
                      isActive
                        ? "bg-[#2663FF]"
                        : "border border-white/20 bg-transparent"
                    }`}
                    onPress={() => {
                      setStatus(opt.value);
                    }}
                  >
                    <Text
                      className={`text-sm ${isActive ? "text-white" : "text-slate-300"}`}
                      style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
              {hasActiveFilters && (
                <Pressable
                  className="rounded-full border border-red-500/40 px-3 py-2"
                  onPress={clearFilters}
                >
                  <Text
                    className="text-sm text-red-400"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    Clear all
                  </Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Section header */}
            <View>
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-lg text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  {hasActiveFilters ? "Filtered results" : "Active invoices"}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    className="rounded-2xl bg-[#2663FF] px-4 py-2"
                    onPress={() => {
                      router.push("/scan");
                    }}
                  >
                    <Text
                      className="text-white"
                      style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                    >
                      📷 Scan QR
                    </Text>
                  </Pressable>
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
              {lastSynced ? (
                <Text
                  className="mt-2 text-xs text-slate-400"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  Last synced: {new Date(lastSynced).toLocaleString()}
                </Text>
              ) : null}
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
                : item.status === "overdue"
                  ? "bg-red-500/20"
                  : "bg-slate-500/20";
          const statusText =
            item.status === "pending"
              ? "text-yellow-300"
              : item.status === "paid"
                ? "text-emerald-300"
                : item.status === "overdue"
                  ? "text-red-300"
                  : "text-slate-300";
          const statusLabel =
            item.status === "pending"
              ? "Pending"
              : item.status === "paid"
                ? "Paid"
                : item.status === "overdue"
                  ? "Overdue"
                  : "Cancelled";
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
                  {item.clientEmail ? (
                    <Text
                      className="mt-0.5 text-xs text-slate-500"
                      style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                      numberOfLines={1}
                    >
                      {item.clientEmail}
                    </Text>
                  ) : null}
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
                      {statusLabel}
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
          ) : hasActiveFilters ? (
            <View className="items-center px-6 py-12">
              <Text
                className="text-xl text-white"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                No matching invoices
              </Text>
              <Text
                className="mt-2 text-center text-sm text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                {search.trim().length > 0
                  ? `No results for "${search.trim()}".`
                  : "No invoices match the selected filter."}
              </Text>
              <Pressable
                className="mt-4 rounded-2xl border border-white/20 px-5 py-2"
                onPress={clearFilters}
              >
                <Text
                  className="text-white"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Clear filters
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center px-6 py-12">
              <Text
                className="text-xl text-white"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                No invoices yet
              </Text>
              <Text
                className="mt-2 text-center text-sm text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Create your first invoice to start tracking payments on-chain.
              </Text>
              <Link href="/create-invoice" asChild>
                <Pressable className="mt-4 rounded-2xl bg-[#2663FF] px-5 py-2">
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
