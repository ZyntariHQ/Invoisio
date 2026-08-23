import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CustomerService, type Customer } from "../lib/customer-service";
import { useAuthStore } from "../hooks/use-auth-store";

const SEARCH_DEBOUNCE_MS = 300;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function CustomersScreen() {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCustomers = useCallback(
    async (query = search, isRefresh = false) => {
      if (!accessToken) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setCustomers(await CustomerService.list(accessToken, query, 50));
      } catch (loadError) {
        setError(errorMessage(loadError, "We couldn't load your customers."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, search],
  );

  useEffect(() => {
    void loadCustomers("");
    // Loading is deliberately only performed at mount; search changes use the debounced handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadCustomers(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setName("");
    setEmail("");
    setNotes("");
    setFormVisible(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setEmail(customer.email ?? "");
    setNotes(customer.notes ?? "");
    setFormVisible(true);
  };

  const closeForm = () => {
    if (!saving) setFormVisible(false);
  };

  const saveCustomer = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Customer name required", "Enter a name before saving.");
      return;
    }
    if (!accessToken) return;

    setSaving(true);
    setError(null);
    const payload = {
      name: trimmedName,
      email: email.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (editingCustomer) {
        const updated = await CustomerService.update(
          accessToken,
          editingCustomer.id,
          payload,
        );
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === updated.id ? updated : customer,
          ),
        );
      } else {
        const created = await CustomerService.create(accessToken, {
          name: payload.name,
          email: payload.email ?? undefined,
          notes: payload.notes ?? undefined,
        });
        setCustomers((current) => [created, ...current]);
      }
      setFormVisible(false);
    } catch (saveError) {
      setError(errorMessage(saveError, "We couldn't save this customer."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (customer: Customer) => {
    Alert.alert(
      "Delete customer?",
      `Remove ${customer.name} from your customer directory? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteCustomer(customer);
          },
        },
      ],
    );
  };

  const deleteCustomer = async (customer: Customer) => {
    if (!accessToken) return;
    setDeletingId(customer.id);
    setError(null);
    try {
      await CustomerService.remove(accessToken, customer.id);
      setCustomers((current) =>
        current.filter((savedCustomer) => savedCustomer.id !== customer.id),
      );
      setFormVisible(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError, "We couldn't delete this customer."));
    } finally {
      setDeletingId(null);
    }
  };

  const isSearching = search.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <FlatList
        data={customers}
        keyExtractor={(customer) => customer.id}
        contentContainerStyle={{ padding: 24, paddingBottom: 56, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadCustomers(search, true)}
            tintColor="#2663FF"
          />
        }
        ListHeaderComponent={
          <View>
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={() => router.back()}
                className="rounded-full bg-slate-800 p-3"
              >
                <Text className="text-lg text-white">←</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Add customer"
                accessibilityRole="button"
                onPress={openCreate}
                className="rounded-2xl bg-[#2663FF] px-4 py-3"
              >
                <Text className="text-sm text-white">+ Add customer</Text>
              </Pressable>
            </View>
            <Text className="mt-6 text-sm uppercase tracking-[0.3em] text-[#7dd3fc]">
              Customer directory
            </Text>
            <Text className="mt-2 text-3xl text-white">Your customers</Text>
            <Text className="mt-2 text-sm leading-5 text-slate-400">
              Keep repeat-client details ready for your next invoice.
            </Text>
            <View className="mt-6 flex-row items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Text className="mr-2 text-base text-slate-400">⌕</Text>
              <TextInput
                value={search}
                onChangeText={handleSearchChange}
                placeholder="Search name or email"
                placeholderTextColor="#64748b"
                className="flex-1 text-base text-white"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (searchTimer.current) clearTimeout(searchTimer.current);
                  void loadCustomers(search);
                }}
              />
              {search.length > 0 && (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  onPress={() => handleSearchChange("")}
                >
                  <Text className="text-base text-slate-400">✕</Text>
                </Pressable>
              )}
            </View>
            {error && (
              <View
                accessible
                accessibilityRole="alert"
                accessibilityLabel={error}
                accessibilityLiveRegion="assertive"
                className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
              >
                <Text className="text-sm text-red-200">{error}</Text>
                <Pressable
                  className="mt-2 self-start"
                  accessibilityRole="button"
                  onPress={() => void loadCustomers(search)}
                >
                  <Text className="text-sm text-red-300">Try again</Text>
                </Pressable>
              </View>
            )}
            {!loading && customers.length > 0 && (
              <Text className="mt-6 text-sm text-slate-400">
                {customers.length}{" "}
                {customers.length === 1 ? "customer" : "customers"}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`Edit ${item.name}`}
            accessibilityRole="button"
            onPress={() => openEdit(item)}
            className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <View className="flex-row items-center justify-between">
              <View className="mr-3 flex-1">
                <Text className="text-lg text-white" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="mt-1 text-sm text-slate-400" numberOfLines={1}>
                  {item.email || "No email address"}
                </Text>
                {item.notes ? (
                  <Text
                    className="mt-2 text-xs text-slate-400"
                    numberOfLines={2}
                  >
                    {item.notes}
                  </Text>
                ) : null}
              </View>
              <Text className="text-lg text-slate-300">›</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator size="large" color="#2663FF" />
              <Text className="mt-4 text-slate-400">Loading customers...</Text>
            </View>
          ) : !error ? (
            <View className="items-center px-5 py-16">
              <Text className="text-xl text-white">
                {isSearching ? "No matching customers" : "No customers yet"}
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-slate-400">
                {isSearching
                  ? `No customer matches “${search.trim()}”.`
                  : "Add a customer to make repeat invoices faster."}
              </Text>
              {!isSearching && (
                <Pressable
                  accessibilityRole="button"
                  onPress={openCreate}
                  className="mt-5 rounded-2xl bg-[#2663FF] px-5 py-3"
                >
                  <Text className="text-white">Add your first customer</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <View
          importantForAccessibility="no-hide-descendants"
          className="flex-1 justify-end bg-black/70"
        >
          <View
            accessibilityViewIsModal
            className="rounded-t-3xl border border-white/10 bg-[#0f172a] p-6"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl text-white">
                {editingCustomer ? "Edit customer" : "New customer"}
              </Text>
              <Pressable
                accessibilityLabel="Close customer form"
                accessibilityRole="button"
                onPress={closeForm}
                disabled={saving}
              >
                <Text className="text-xl text-slate-300">✕</Text>
              </Pressable>
            </View>
            <Text className="mt-5 text-sm text-slate-300">Name</Text>
            <TextInput
              accessibilityLabel="Customer name, required"
              value={name}
              onChangeText={setName}
              placeholder="Customer name"
              placeholderTextColor="#64748b"
              className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              autoFocus
            />
            <Text className="mt-4 text-sm text-slate-300">Email</Text>
            <TextInput
              accessibilityLabel="Customer email"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor="#64748b"
              className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text className="mt-4 text-sm text-slate-300">Notes</Text>
            <TextInput
              accessibilityLabel="Customer notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor="#64748b"
              className="mt-2 min-h-20 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              multiline
              textAlignVertical="top"
            />
            <Pressable
              onPress={() => void saveCustomer()}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              className="mt-6 items-center rounded-2xl bg-[#2663FF] px-5 py-4"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base text-white">Save customer</Text>
              )}
            </Pressable>
            {editingCustomer && (
              <Pressable
                onPress={() => confirmDelete(editingCustomer)}
                disabled={saving || deletingId === editingCustomer.id}
                accessibilityRole="button"
                className="mt-3 items-center rounded-2xl border border-red-500/40 px-5 py-4"
              >
                {deletingId === editingCustomer.id ? (
                  <ActivityIndicator color="#f87171" />
                ) : (
                  <Text className="text-base text-red-400">
                    Delete customer
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
