import { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../hooks/use-auth-store";
import { MerchantService } from "../lib/merchant-service";
import { CustomerService, Customer } from "../lib/customer-service";

const currencies = ["USDC", "EURC", "USD"];
const paymentTerms = ["Net 7", "Net 14", "Net 30"];

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [company, setCompany] = useState("Lambda Cargo");
  const [amount, setAmount] = useState("18,750");
  const [currency, setCurrency] = useState("USDC");
  const [terms, setTerms] = useState("Net 14");
  const [memo, setMemo] = useState("Freight settlement for Q1 routes");
  const [payoutKey, setPayoutKey] = useState<string | null>(null);

  // Customer search state
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load merchant preferred asset and payout key on mount
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await MerchantService.getProfile(accessToken);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may be mutated by cleanup
        if (!cancelled) {
          // Pre-select the merchant's preferred asset if it's in the currency list
          if (currencies.includes(profile.preferredAsset)) {
            setCurrency(profile.preferredAsset);
          }
          setPayoutKey(profile.payoutPublicKey ?? null);
        }
      } catch (err) {
        console.error("Failed to load merchant settings:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Debounced customer search
  useEffect(() => {
    if (!accessToken) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      setShowCustomerResults(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await CustomerService.search(
            accessToken,
            customerQuery.trim(),
            8,
          );
          setCustomerResults(results);
          setShowCustomerResults(results.length > 0);
        } catch {
          setCustomerResults([]);
        }
      })();
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [customerQuery, accessToken]);

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCompany(customer.name);
    setCustomerQuery(
      `${customer.name}${customer.email ? ` (${customer.email})` : ""}`,
    );
    setShowCustomerResults(false);
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCompany("");
  };

  const confirmInvoice = () => {
    router.push("/dashboard");
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
          <Text
            className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Draft invoice
          </Text>
          <Text
            className="mt-2 text-4xl text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Issue programmable receivables with Base settlement.
          </Text>
          <Text
            className="mt-2 text-base text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Define counterparties, stablecoin rails, and payment automation in
            one flow.
          </Text>

          <View className="mt-10 gap-6">
            {/* Saved Client Search */}
            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Saved client
              </Text>
              <TextInput
                value={customerQuery}
                onChangeText={(text: string) => {
                  setCustomerQuery(text);
                  if (selectedCustomer) {
                    setSelectedCustomer(null);
                  }
                }}
                placeholder="Search saved clients..."
                placeholderTextColor="#475569"
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                autoComplete="off"
              />
              {selectedCustomer && (
                <View className="mt-2 flex-row items-center justify-between rounded-xl border border-[#00D6B9]/30 bg-[#00D6B9]/10 px-4 py-2">
                  <View>
                    <Text
                      className="text-sm text-[#00D6B9]"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {selectedCustomer.name}
                    </Text>
                    {selectedCustomer.email && (
                      <Text
                        className="text-xs text-slate-400"
                        style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                      >
                        {selectedCustomer.email}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={clearSelectedCustomer}>
                    <Text className="text-sm text-slate-400">✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showCustomerResults && customerResults.length > 0 && (
                <View className="mt-2 rounded-2xl border border-white/10 bg-[#0d1525]">
                  <FlatList
                    data={customerResults}
                    keyExtractor={(item: Customer) => item.id}
                    nestedScrollEnabled
                    style={{ maxHeight: 200 }}
                    renderItem={({ item }: { item: Customer }) => (
                      <Pressable
                        className="border-b border-white/5 px-4 py-3"
                        onPress={() => {
                          selectCustomer(item);
                        }}
                      >
                        <Text
                          className="text-sm text-white"
                          style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                        >
                          {item.name}
                        </Text>
                        {item.email && (
                          <Text
                            className="text-xs text-slate-400"
                            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                          >
                            {item.email}
                          </Text>
                        )}
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Counterparty name
              </Text>
              <TextInput
                value={company}
                onChangeText={setCompany}
                placeholder="Vendor or client"
                placeholderTextColor="#475569"
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              />
            </View>

            <View className="flex-row gap-4">
              <View className="flex-1">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Amount
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                  style={{
                    fontFamily: "SpaceGrotesk_600SemiBold",
                    fontSize: 18,
                  }}
                />
              </View>
              <View className="flex-1">
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Currency
                </Text>
                <View className="mt-3 flex-row rounded-2xl border border-white/10 bg-white/5">
                  {currencies.map((option) => (
                    <Pressable
                      key={option}
                      className={`flex-1 items-center justify-center rounded-2xl py-3 ${
                        currency === option ? "bg-white" : ""
                      }`}
                      onPress={() => {
                        setCurrency(option);
                      }}
                    >
                      <Text
                        className={`text-base ${currency === option ? "text-[#050914]" : "text-white"}`}
                        style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Payment terms
              </Text>
              <View className="mt-3 flex-row rounded-2xl border border-white/10 bg-white/5">
                {paymentTerms.map((option) => (
                  <Pressable
                    key={option}
                    className={`flex-1 items-center justify-center rounded-2xl py-3 ${
                      terms === option ? "bg-[#2663FF]" : ""
                    }`}
                    onPress={() => {
                      setTerms(option);
                    }}
                  >
                    <Text
                      className={`text-base ${terms === option ? "text-white" : "text-slate-300"}`}
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text
                className="text-sm text-slate-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Memo / Scope
              </Text>
              <TextInput
                value={memo}
                onChangeText={setMemo}
                multiline
                numberOfLines={4}
                className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
                placeholder="Describe the services, collateral, or shipment"
                placeholderTextColor="#475569"
                style={{
                  fontFamily: "SpaceGrotesk_500Medium",
                  textAlignVertical: "top",
                }}
              />
            </View>
          </View>

          <View className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5">
            <Text
              className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Automated routing
            </Text>
            <Text
              className="mt-3 text-xl text-white"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              80% to operating wallet, 20% to treasury multisig.
            </Text>
            <Text
              className="mt-2 text-sm text-slate-300"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Each invoice inherits programmable payout splits and Base proofs
              for counterparty transparency.
            </Text>
            {payoutKey && (
              <View className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Payout destination
                </Text>
                <Text
                  className="mt-1 text-xs text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {payoutKey}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            className="mt-8 rounded-2xl bg-[#00D6B9] py-4 shadow-lg shadow-[#00D6B9]/50"
            onPress={confirmInvoice}
          >
            <Text
              className="text-center text-lg text-[#041125]"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              Mint invoice NFT + share pay link
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
