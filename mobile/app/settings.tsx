import { View, Text, Switch, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuthStore } from "../hooks/use-auth-store";
import { AuthService } from "../lib/auth-service";
import { ArrowLeft } from "lucide-react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const togglePush = async (value: boolean) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      await AuthService.updatePushPreferences(accessToken, value);
      setPushEnabled(value);
    } catch (error) {
      Alert.alert("Error", "Failed to update preferences");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050914] px-4">
      <View className="flex-row items-center pt-4 pb-6">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 rounded-full bg-slate-800"
        >
          <ArrowLeft size={20} color="#E2E8F0" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-white font-grotesk">Settings</Text>
      </View>

      <View className="bg-slate-800/50 p-4 rounded-xl border border-slate-800">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-white text-lg font-medium font-grotesk">Push Notifications</Text>
            <Text className="text-slate-400 text-sm mt-1">Receive alerts for paid and overdue invoices</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={togglePush}
            disabled={loading}
            trackColor={{ false: "#334155", true: "#3b82f6" }}
            thumbColor={pushEnabled ? "#ffffff" : "#94a3b8"}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
