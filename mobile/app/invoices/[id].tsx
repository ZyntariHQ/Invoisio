import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { API_URL } from "@env";
import { useAuthStore } from "../../hooks/use-auth-store";
import type { Invoice } from "../../lib/invoices";

export default function InvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const { data, isLoading } = useQuery<Invoice>({
    queryKey: ["invoice", id, accessToken],
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
  });

  const invoice = data;
  const created = invoice
    ? new Date(invoice.createdAt).toLocaleString()
    : undefined;

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-6 pt-10">
          <Pressable
            className="mb-4 rounded-2xl border border-white/20 px-4 py-2"
            onPress={() => {
              router.back();
            }}
          >
            <Text
              className="text-white"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Back
            </Text>
          </Pressable>
          {isLoading ? (
            <View className="h-32 animate-pulse rounded-2xl bg-white/10" />
          ) : invoice ? (
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
                    $
                    {invoice.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {invoice.asset}
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
