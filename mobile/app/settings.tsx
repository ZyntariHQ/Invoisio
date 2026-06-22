import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Alert,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../hooks/use-auth-store";
import { AuthService } from "../lib/auth-service";
import {
  MerchantService,
  isValidStellarPublicKey,
  type MerchantProfile,
} from "../lib/merchant-service";

const ASSET_OPTIONS = ["USDC", "EURC", "XLM", "USD"] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);

  // Merchant profile / settings state
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [payoutKey, setPayoutKey] = useState("");
  const [preferredAsset, setPreferredAsset] = useState("USDC");

  // Inline validation errors
  const [payoutKeyError, setPayoutKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Track whether user has touched the field (for inline feedback)
  const [payoutKeyTouched, setPayoutKeyTouched] = useState(false);

  /** Load merchant profile on mount */
  const loadProfile = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await MerchantService.getProfile(accessToken);
      setProfile(data);
      setName(data.name);
      setPayoutKey(data.payoutPublicKey ?? "");
      setPreferredAsset(data.preferredAsset);
    } catch (err) {
      console.error("Failed to load merchant profile:", err);
      Alert.alert("Error", "Failed to load merchant settings.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /** Validate payout key on change */
  const handlePayoutKeyChange = (value: string) => {
    setPayoutKey(value);
    setPayoutKeyTouched(true);

    if (value === "") {
      setPayoutKeyError(null);
    } else if (!isValidStellarPublicKey(value)) {
      setPayoutKeyError(
        "Must be a valid Stellar G-address (56 chars, starts with G, base-32 encoded).",
      );
    } else {
      setPayoutKeyError(null);
    }
  };

  /** Validate merchant name on change */
  const handleNameChange = (value: string) => {
    setName(value);
    if (value.trim().length === 0) {
      setNameError("Merchant name cannot be empty.");
    } else {
      setNameError(null);
    }
  };

  /** Save merchant settings */
  const handleSave = async () => {
    if (!accessToken) return;

    // Validate before saving
    let hasError = false;
    if (name.trim().length === 0) {
      setNameError("Merchant name cannot be empty.");
      hasError = true;
    }
    if (payoutKey !== "" && !isValidStellarPublicKey(payoutKey)) {
      setPayoutKeyError(
        "Must be a valid Stellar G-address (56 chars, starts with G, base-32 encoded).",
      );
      setPayoutKeyTouched(true);
      hasError = true;
    }
    if (hasError) return;

    setSaving(true);
    try {
      const payload: Record<string, string> = {
        name: name.trim(),
        preferredAsset,
      };
      const trimmedPayout = payoutKey.trim();
      if (trimmedPayout) {
        payload["payoutPublicKey"] = trimmedPayout;
      }
      const updated = await MerchantService.updateSettings(
        accessToken,
        payload,
      );
      setProfile(updated);
      Alert.alert("Success", "Settings saved successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  /** Toggle push notifications */
  const togglePush = async (value: boolean) => {
    if (!accessToken) return;
    setPushLoading(true);
    try {
      await AuthService.updatePushPreferences(accessToken, value);
      setPushEnabled(value);
    } catch {
      Alert.alert("Error", "Failed to update push preferences.");
    } finally {
      setPushLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#050914] items-center justify-center">
        <ActivityIndicator size="large" color="#2663FF" />
        <Text
          className="mt-4 text-slate-300"
          style={{ fontFamily: "SpaceGrotesk_400Regular" }}
        >
          Loading settings...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
        {/* Header */}
        <View className="flex-row items-center pb-6">
          <TouchableOpacity
            onPress={() => {
              router.back();
            }}
            className="mr-4 rounded-full bg-slate-800 p-2"
          >
            <Text className="text-lg text-white">{"\u2190"}</Text>
          </TouchableOpacity>
          <Text
            className="text-2xl text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Settings
          </Text>
        </View>

        {/* ─── Merchant Profile Section ─── */}
        <Text
          className="text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
          style={{ fontFamily: "SpaceGrotesk_500Medium" }}
        >
          Merchant profile
        </Text>

        {/* Merchant Name */}
        <View className="mt-4">
          <Text
            className="text-sm text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Merchant name
          </Text>
          <TextInput
            value={name}
            onChangeText={handleNameChange}
            placeholder="Your business name"
            placeholderTextColor="#475569"
            className={`mt-2 rounded-2xl border bg-white/5 px-4 py-4 text-white ${
              nameError ? "border-red-500/60" : "border-white/10"
            }`}
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          />
          {nameError && (
            <Text
              className="mt-1 text-xs text-red-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              {nameError}
            </Text>
          )}
        </View>

        {/* Connected Stellar Account */}
        {profile && (
          <View className="mt-4">
            <Text
              className="text-sm text-slate-300"
              style={{ fontFamily: "SpaceGrotesk_500Medium" }}
            >
              Connected Stellar account
            </Text>
            <View className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Text
                className="text-sm text-slate-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
                selectable
              >
                {profile.stellarPublicKey}
              </Text>
            </View>
          </View>
        )}

        {/* ─── Payout Wallet Section ─── */}
        <Text
          className="mt-8 text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
          style={{ fontFamily: "SpaceGrotesk_500Medium" }}
        >
          Payout wallet
        </Text>

        <View className="mt-4">
          <Text
            className="text-sm text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Payout public key
          </Text>
          <Text
            className="mt-1 text-xs text-slate-500"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Stellar G-address where payout disbursements are sent. Leave blank
            to use the connected account.
          </Text>
          <TextInput
            value={payoutKey}
            onChangeText={handlePayoutKeyChange}
            placeholder="G..."
            placeholderTextColor="#475569"
            autoCapitalize="characters"
            autoCorrect={false}
            className={`mt-2 rounded-2xl border bg-white/5 px-4 py-4 text-white ${
              payoutKeyTouched && payoutKeyError
                ? "border-red-500/60"
                : payoutKey && isValidStellarPublicKey(payoutKey)
                  ? "border-emerald-500/60"
                  : "border-white/10"
            }`}
            style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 13 }}
          />
          {payoutKeyTouched && payoutKeyError && (
            <Text
              className="mt-1 text-xs text-red-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              {payoutKeyError}
            </Text>
          )}
          {payoutKey &&
            !payoutKeyError &&
            isValidStellarPublicKey(payoutKey) && (
              <Text
                className="mt-1 text-xs text-emerald-400"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Valid Stellar public key
              </Text>
            )}
        </View>

        {/* ─── Preferred Asset Section ─── */}
        <Text
          className="mt-8 text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
          style={{ fontFamily: "SpaceGrotesk_500Medium" }}
        >
          Preferred asset
        </Text>
        <Text
          className="mt-1 text-xs text-slate-500"
          style={{ fontFamily: "SpaceGrotesk_400Regular" }}
        >
          Default asset pre-selected when creating new invoices.
        </Text>
        <View className="mt-3 flex-row rounded-2xl border border-white/10 bg-white/5">
          {ASSET_OPTIONS.map((option) => (
            <Pressable
              key={option}
              className={`flex-1 items-center justify-center rounded-2xl py-3 ${
                preferredAsset === option ? "bg-[#2663FF]" : ""
              }`}
              onPress={() => {
                setPreferredAsset(option);
              }}
            >
              <Text
                className={`text-sm ${
                  preferredAsset === option ? "text-white" : "text-slate-300"
                }`}
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ─── Save Button ─── */}
        <Pressable
          className={`mt-8 rounded-2xl py-4 shadow-lg ${
            saving ? "bg-[#2663FF]/50" : "bg-[#2663FF] shadow-[#2663FF]/40"
          }`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              className="text-center text-lg text-white"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              Save settings
            </Text>
          )}
        </Pressable>

        {/* ─── Notifications Section ─── */}
        <Text
          className="mt-10 text-sm uppercase tracking-[0.3em] text-[#7dd3fc]"
          style={{ fontFamily: "SpaceGrotesk_500Medium" }}
        >
          Notifications
        </Text>

        <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text
                className="text-white text-base"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
              >
                Push Notifications
              </Text>
              <Text
                className="text-slate-400 text-sm mt-1"
                style={{ fontFamily: "SpaceGrotesk_400Regular" }}
              >
                Receive alerts for paid and overdue invoices
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              disabled={pushLoading}
              trackColor={{ false: "#334155", true: "#3b82f6" }}
              thumbColor={pushEnabled ? "#ffffff" : "#94a3b8"}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
