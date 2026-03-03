import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import invoisioLogo from "../assets/invoisio-logo.png";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("founder@invoisio.com");
  const [code, setCode] = useState("");

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView contentContainerStyle={{ padding: 24 }} bounces={false}>
        <View className="flex-row items-center gap-3">
          <Image
            source={invoisioLogo}
            className="h-10 w-10"
            resizeMode="contain"
          />
          <Text
            className="text-3xl text-white"
            style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
          >
            Invoisio Console
          </Text>
        </View>

        <LinearGradient
          colors={["#0F172A", "#111C36", "#050914"]}
          className="mt-8 rounded-3xl p-6"
        >
          <Text
            className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Welcome back
          </Text>
          <Text
            className="mt-3 text-4xl text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Authenticate with the wallet email you onboarded.
          </Text>
          <Text
            className="mt-3 text-base text-slate-200"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            We verify device posture and sign you into the Base-connected
            operator dashboard.
          </Text>
        </LinearGradient>

        <View className="mt-8 gap-5">
          <View>
            <Text
              className="text-sm text-slate-200"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Work email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-white"
              placeholder="you@company.xyz"
              placeholderTextColor="#64748b"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            />
          </View>
          <View>
            <Text
              className="text-sm text-slate-200"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              6-digit code
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center text-2xl tracking-widest text-white"
              placeholder="••••••"
              placeholderTextColor="#475569"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            />
          </View>

          <Pressable
            className="rounded-2xl bg-[#2663FF] py-4 shadow-lg shadow-[#1d4ed8]/40"
            onPress={() => router.push("/dashboard")}
          >
            <Text
              className="text-center text-lg text-white"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              Continue to dashboard
            </Text>
          </Pressable>

          <View className="flex-row items-center justify-center gap-2">
            <Text
              className="text-sm text-slate-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Need to send a new code?
            </Text>
            <Pressable className="pb-0.5" onPress={() => setCode("")}>
              <Text
                className="text-sm text-white"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                Resend
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-12 items-center gap-2">
          <Text
            className="text-slate-500"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Onboard a new entity?
          </Text>
          <Link href="/create-invoice" asChild>
            <Pressable className="rounded-2xl border border-white/15 px-6 py-3">
              <Text
                className="text-white"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Launch issuer workflow
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
