import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";

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
    <View className={`rounded-full px-3 py-1 ${bg}`}>
      <Text className={`text-sm font-medium ${color}`}>{label}</Text>
    </View>
  );
};

export default function InvoiceDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data } = await axios.get(`http://localhost:3000/invoices/${id}`);
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-brand-background items-center justify-center">
        <ActivityIndicator color="#7dd3fc" size="large" />
      </SafeAreaView>
    );
  }

  if (isError || !invoice) {
    return (
      <SafeAreaView className="flex-1 bg-brand-background items-center justify-center px-6">
        <Text className="text-xl text-white text-center">Invoice not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl bg-white/10 px-6 py-3">
          <Text className="text-white">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-background">
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
              {invoice.invoiceNumber}
            </Text>
            <Text className="text-white text-3xl font-bold mt-1" style={{ fontFamily: "SpaceGrotesk_700Bold" }}>
              {invoice.clientName}
            </Text>
          </View>
          <StatusBadge status={invoice.status} />
        </View>

        <LinearGradient colors={["#111C36", "#0F172A"]} className="mt-8 rounded-3xl p-6 border border-white/10">
          <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
            Total Amount
          </Text>
          <Text className="text-white text-4xl font-bold mt-2" style={{ fontFamily: "SpaceGrotesk_700Bold" }}>
            {invoice.amount} <Text className="text-xl text-slate-400">{invoice.assetCode || invoice.asset_code}</Text>
          </Text>
        </LinearGradient>

        <View className="mt-10 gap-8">
          <View>
            <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
              Description
            </Text>
            <Text className="text-white text-lg mt-2" style={{ fontFamily: "SpaceGrotesk_400Regular" }}>
              {invoice.description || "No description provided"}
            </Text>
          </View>

          <View className="flex-row gap-8">
            <View className="flex-1">
              <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
                Created At
              </Text>
              <Text className="text-white text-lg mt-2" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
                {new Date(invoice.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
                Due Date
              </Text>
              <Text className="text-white text-lg mt-2" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
                {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}
              </Text>
            </View>
          </View>

          <View>
            <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
              Client Email
            </Text>
            <Text className="text-white text-lg mt-2" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
              {invoice.clientEmail}
            </Text>
          </View>

          <View>
            <Text className="text-slate-400 text-sm font-medium" style={{ fontFamily: "SpaceGrotesk_500Medium" }}>
              Destination Address
            </Text>
            <Text className="text-slate-400 text-xs mt-2 font-mono" numberOfLines={1}>
              {invoice.destinationAddress || invoice.destination_address}
            </Text>
          </View>
        </View>

        <Pressable className="mt-12 rounded-2xl bg-white py-4 active:opacity-90" onPress={() => router.back()}>
          <Text className="text-center text-[#050914] text-lg font-bold" style={{ fontFamily: "SpaceGrotesk_700Bold" }}>
            Back to Dashboard
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
