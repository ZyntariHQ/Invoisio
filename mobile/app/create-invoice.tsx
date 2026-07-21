import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../hooks/use-auth-store";
import { MerchantService } from "../lib/merchant-service";
import { useOfflineMutation } from "../hooks/use-offline-mutation";
import axios from "axios";
import { API_URL } from "@env";

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
  const [showQueuedMessage, setShowQueuedMessage] = useState(false);

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

  // Offline mutation for creating invoices
  const createInvoiceMutation = useOfflineMutation(
    async (data: any) => {
      const response = await axios.post(`${API_URL}/invoices`, data, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        // Navigate to invoice details on success
        router.push(`/invoices/${data.id}`);
      },
      onError: (error) => {
        // Handle error
        console.error("Invoice creation failed:", error);
        Alert.alert(
          "Error",
          "Failed to create invoice. Please try again.",
          [{ text: "OK" }]
        );
      },
      onQueue: () => {
        // Show user that the request is queued
        setShowQueuedMessage(true);
        Alert.alert(
          "Request Queued",
          "You are currently offline. Your invoice will be created automatically when you reconnect.",
          [{ text: "OK" }]
        );
      },
    }
  );

  const confirmInvoice = () => {
    // Parse amount string (remove commas)
    const parsedAmount = parseFloat(amount.replace(/,/g, ""));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid positive amount.",
        [{ text: "OK" }]
      );
      return;
    }

    // Prepare invoice data
    const invoiceData = {
      clientName: company,
      amount: parsedAmount,
      asset: currency,
      memo: memo,
      paymentTerms: terms,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    };

    // Execute mutation
    void createInvoiceMutation.mutate(invoiceData);
  };

  const isLoading = createInvoiceMutation.isLoading;
  const isQueued = createInvoiceMutation.isQueued;

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
          {/* Queued status indicator */}
          {isQueued && (
            <View className="mb-4 rounded-xl bg-blue-500/20 p-4 border border-blue-500/50">
              <Text
                className="text-center text-sm text-blue-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                ⏳ Invoice is queued and will be created when online
              </Text>
            </View>
          )}

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
                editable={!isLoading}
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
                  editable={!isLoading}
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
                        if (!isLoading) setCurrency(option);
                      }}
                      disabled={isLoading}
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
                      if (!isLoading) setTerms(option);
                    }}
                    disabled={isLoading}
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
                editable={!isLoading}
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
            className={`mt-8 rounded-2xl py-4 shadow-lg shadow-[#00D6B9]/50 ${
              isLoading ? "bg-[#00D6B9]/50" : "bg-[#00D6B9]"
            }`}
            onPress={confirmInvoice}
            disabled={isLoading}
          >
            <Text
              className={`text-center text-lg ${
                isLoading ? "text-[#041125]/50" : "text-[#041125]"
              }`}
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              {isLoading ? "Creating..." : "Mint invoice NFT + share pay link"}
            </Text>
          </Pressable>

          {showQueuedMessage && (
            <View className="mt-4 rounded-xl bg-yellow-500/20 p-4 border border-yellow-500/50">
              <Text
                className="text-center text-sm text-yellow-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                🔄 Invoice creation queued. You will be notified when it's processed.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}