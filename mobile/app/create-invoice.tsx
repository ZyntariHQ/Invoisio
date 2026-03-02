import { useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const currencies = ["USDC", "EURC", "USD"];
const paymentTerms = ["Net 7", "Net 14", "Net 30"];

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const [company, setCompany] = useState("Lambda Cargo");
  const [amount, setAmount] = useState("18,750");
  const [currency, setCurrency] = useState("USDC");
  const [terms, setTerms] = useState("Net 14");
  const [memo, setMemo] = useState("Freight settlement for Q1 routes");

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
                      onPress={() => setCurrency(option)}
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
                    onPress={() => setTerms(option)}
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
