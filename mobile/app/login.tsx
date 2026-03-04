import { useEffect } from "react";
import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import invoisioLogo from "../assets/invoisio-logo.png";
import { useWalletAuth } from "../hooks/use-wallet-auth";

export default function LoginScreen() {
  const router = useRouter();
  const {
    isConnected,
    publicKey,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
  } = useWalletAuth();

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (isConnected && publicKey) {
      router.push("/dashboard");
    }
  }, [isConnected, publicKey, router]);

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (err) {
      // Error is handled by the hook
      console.error("Connection error:", err);
    }
  };

  const handleDisconnect = () => {
    Alert.alert("Disconnect Wallet", "Are you sure you want to disconnect?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          disconnectWallet().catch((err: unknown) => {
            console.error("Disconnect error:", err);
          });
        },
      },
    ]);
  };

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
            Connect your Stellar wallet
          </Text>
          <Text
            className="mt-3 text-base text-slate-200"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Sign in securely with LOBSTR, xBull, or any Stellar wallet.
          </Text>
        </LinearGradient>

        <View className="mt-8 gap-5">
          {isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#2663FF" />
              <Text
                className="mt-4 text-slate-300"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Connecting to wallet...
              </Text>
            </View>
          ) : isConnected && publicKey ? (
            <View className="gap-4">
              <View className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <Text
                  className="text-center text-emerald-300"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  ✓ Wallet Connected
                </Text>
                <Text
                  className="mt-2 text-center text-xs text-slate-300"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
                </Text>
              </View>

              <Pressable
                className="rounded-2xl bg-[#2663FF] py-4 shadow-lg shadow-[#1d4ed8]/40"
                onPress={() => {
                  router.push("/dashboard");
                }}
              >
                <Text
                  className="text-center text-lg text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Continue to Dashboard
                </Text>
              </Pressable>

              <Pressable
                className="rounded-2xl border border-red-500/30 py-4"
                onPress={handleDisconnect}
              >
                <Text
                  className="text-center text-lg text-red-400"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Disconnect Wallet
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                className="rounded-2xl bg-[#2663FF] py-4 shadow-lg shadow-[#1d4ed8]/40"
                onPress={handleConnectWallet}
              >
                <Text
                  className="text-center text-lg text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Connect Wallet
                </Text>
              </Pressable>

              <View className="items-center gap-2">
                <Text
                  className="text-xs text-slate-400"
                  style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                >
                  Supports LOBSTR, xBull, and other Stellar wallets
                </Text>
              </View>
            </>
          )}

          {error && (
            <View className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
              <Text
                className="text-center text-red-300"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                {error}
              </Text>
            </View>
          )}
        </View>

        <View className="mt-12 items-center gap-2">
          <Text
            className="text-slate-500"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            New to Invoisio?
          </Text>
          <Link href="/create-invoice" asChild>
            <Pressable className="rounded-2xl border border-white/15 px-6 py-3">
              <Text
                className="text-white"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Create your first invoice
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
