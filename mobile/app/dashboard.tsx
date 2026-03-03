import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const metrics = [
  { label: "Outstanding", value: "$482k", delta: "+12%" },
  { label: "Receipts (24h)", value: "$91k", delta: "^" },
  { label: "Average AR", value: "21 days", delta: "-5d" },
];

const invoices = [
  {
    id: "INV-2048",
    company: "Nimbus Freight",
    amount: "$42,600",
    status: "Awaiting payment",
  },
  {
    id: "INV-2049",
    company: "Atlas Robotics",
    amount: "$31,120",
    status: "Financed",
  },
  {
    id: "INV-2050",
    company: "Northwind Labs",
    amount: "$18,450",
    status: "Scheduled",
  },
];

export default function DashboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
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
          data={metrics}
          keyExtractor={(item) => item.label}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
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
              <Text
                className="mt-1 text-sm text-emerald-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                {item.delta}
              </Text>
            </LinearGradient>
          )}
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

          <View className="mt-4 rounded-3xl border border-white/10 bg-white/5">
            {invoices.map((invoice, index) => (
              <View
                key={invoice.id}
                className="flex-row items-center justify-between px-4 py-4 border-white/5"
                style={{
                  borderBottomWidth: index === invoices.length - 1 ? 0 : 1,
                }}
              >
                <View>
                  <Text
                    className="text-sm text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {invoice.id}
                  </Text>
                  <Text
                    className="text-xl text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    {invoice.company}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-lg text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    {invoice.amount}
                  </Text>
                  <Text
                    className="text-sm text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                  >
                    {invoice.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
