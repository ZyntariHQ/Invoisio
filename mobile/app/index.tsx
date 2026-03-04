import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import invoisioLogo from "../assets/invoisio-logo.png";

const stats = [
  { label: "Invoices sent", value: "8,420" },
  { label: "Avg. settlement", value: "34 min" },
  { label: "Stable yield", value: "14.2%" },
];

const features = [
  {
    title: "On-chain custody",
    description:
      "Invoisio moves receivables through audited Base contracts, so every dollar is traceable and programmable.",
  },
  {
    title: "Real-time FX",
    description:
      "Issue invoices in USDC, EURC, or fiat pairs while we hedge exposure automatically in the background.",
  },
  {
    title: "Instant financing",
    description:
      "Turn any approved invoice into upfront liquidity with one tap and zero paperwork.",
  },
];

export default function LandingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brand-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-10">
          <View className="flex-row items-center gap-3">
            <Image
              source={invoisioLogo}
              className="h-10 w-10"
              resizeMode="contain"
            />
            <Text
              className="text-2xl text-white"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              Invoisio
            </Text>
          </View>
          <LinearGradient
            colors={["#0F172A", "#111C36", "#050914"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="mt-8 rounded-3xl p-6"
          >
            <Text
              className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Base native invoicing
            </Text>
            <Text
              className="mt-4 text-4xl leading-tight text-white"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              The fastest way to request, finance, and settle invoices onchain.
            </Text>
            <Text
              className="mt-4 text-base text-slate-200"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Automate receivables, unlock predictable yield, and operate
              globally with compliant stablecoins.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <Link href="/login" asChild>
                <Pressable className="flex-1 items-center justify-center rounded-2xl bg-[#2663FF] px-4 py-4 shadow-lg shadow-[#2663FF]/40">
                  <Text
                    className="text-base text-white"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    Launch Console
                  </Text>
                </Pressable>
              </Link>
              <Link href="/dashboard" asChild>
                <Pressable className="flex-1 items-center justify-center rounded-2xl border border-white/20 px-4 py-4">
                  <Text
                    className="text-base text-white"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    View Demo
                  </Text>
                </Pressable>
              </Link>
            </View>
            <View className="mt-6 flex-row flex-wrap gap-4">
              {stats.map((stat) => (
                <View
                  key={stat.label}
                  className="w-[30%] min-w-[100px] flex-1 rounded-2xl border border-white/10 p-4"
                >
                  <Text
                    className="text-xs uppercase tracking-wide text-slate-400"
                    style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                  >
                    {stat.label}
                  </Text>
                  <Text
                    className="mt-2 text-2xl text-white"
                    style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                  >
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        <View className="mt-10 px-6">
          <Text
            className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Why operators switch
          </Text>
          <Text
            className="mt-3 text-3xl text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Built for modern finance teams
          </Text>
          <Text
            className="mt-2 text-base text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Every workflow is tuned for predictable cashflow: automated
            reminders, embedded payouts, and live portfolio intelligence.
          </Text>
          <View className="mt-6 gap-4">
            {features.map((feature) => (
              <View
                key={feature.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-5"
              >
                <Text
                  className="text-xl text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  {feature.title}
                </Text>
                <Text
                  className="mt-2 text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  {feature.description}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mt-14 px-6">
          <LinearGradient
            colors={["#141B2F", "#1A2C4A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-3xl p-6"
          >
            <Text
              className="text-sm uppercase tracking-[0.3em] text-[#86efac]"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Trusted by Base-native businesses
            </Text>
            <Text
              className="mt-3 text-3xl text-white"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              "We replaced three tools and reconciled 97% faster."
            </Text>
            <Text
              className="mt-2 text-base text-slate-200"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Invoisio closes the loop between payments and accounting so we can
              prove reserves, share yield, and delight vendors in one motion.
            </Text>
            <View className="mt-5 flex-row items-center justify-between">
              <View>
                <Text
                  className="text-lg text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Ava Martinez
                </Text>
                <Text
                  className="text-sm text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  CFO, Lumen Freight
                </Text>
              </View>
              <Link href="/create-invoice" asChild>
                <Pressable className="rounded-2xl bg-white px-4 py-3">
                  <Text
                    className="text-base text-[#050914]"
                    style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                  >
                    Draft invoice
                  </Text>
                </Pressable>
              </Link>
            </View>
          </LinearGradient>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
