import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseQrCode, type ParsedPayment } from "../lib/parse-qr";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [payment, setPayment] = useState<ParsedPayment | null>(null);
  const [launching, setLaunching] = useState(false);
  const processingRef = useRef(false);

  // ── permission states ─────────────────────────────────────────────────────

  if (!permission) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#050914]">
        <ActivityIndicator color="#E2E8F0" size="large" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#050914] px-8">
        <Text
          className="text-center text-2xl text-white"
          style={{ fontFamily: "SpaceGrotesk_700Bold" }}
        >
          Camera access needed
        </Text>
        <Text
          className="mt-3 text-center text-base text-slate-400"
          style={{ fontFamily: "SpaceGrotesk_400Regular" }}
        >
          Allow camera access to scan Stellar payment QR codes.
        </Text>
        <Pressable
          className="mt-6 rounded-2xl bg-[#2663FF] px-8 py-4"
          onPress={() => void requestPermission()}
        >
          <Text
            className="text-white"
            style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
          >
            Grant permission
          </Text>
        </Pressable>
        <Pressable
          className="mt-4 px-4 py-3"
          onPress={() => {
            router.back();
          }}
        >
          <Text
            className="text-slate-400"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Go back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleBarcode = ({ data }: { data: string }) => {
    if (processingRef.current || scanned) return;
    processingRef.current = true;

    const result = parseQrCode(data);

    if (typeof result === "string") {
      // error message
      Alert.alert("Invalid QR code", result, [
        {
          text: "Try again",
          onPress: () => {
            processingRef.current = false;
          },
        },
      ]);
      return;
    }

    setPayment(result);
    setScanned(true);
  };

  const handleConfirmPayment = async () => {
    if (!payment) return;
    setLaunching(true);

    try {
      const canOpen = await Linking.canOpenURL(payment.sep0007Uri);
      if (canOpen) {
        await Linking.openURL(payment.sep0007Uri);
      } else {
        Alert.alert(
          "No wallet found",
          "No Stellar wallet app (e.g. LOBSTR) is installed that can handle this payment link.",
          [{ text: "OK" }],
        );
      }
    } catch {
      Alert.alert("Error", "Failed to open wallet app. Please try again.");
    } finally {
      setLaunching(false);
    }
  };

  const handleDismiss = () => {
    setPayment(null);
    setScanned(false);
    processingRef.current = false;
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4">
        <Pressable
          className="mr-4 rounded-xl border border-white/20 px-4 py-2"
          onPress={() => {
            router.back();
          }}
        >
          <Text
            className="text-white"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            ← Back
          </Text>
        </Pressable>
        <Text
          className="text-lg text-white"
          style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
        >
          Scan to Pay
        </Text>
      </View>

      {/* Camera */}
      <View className="flex-1 overflow-hidden rounded-3xl mx-4 mb-4">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />

        {/* Finder overlay */}
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View className="h-64 w-64 rounded-3xl border-2 border-[#2663FF]" />
          <Text
            className="mt-6 text-center text-sm text-white/70"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            Align the QR code inside the frame
          </Text>
        </View>
      </View>

      {/* Confirmation modal */}
      <Modal
        visible={!!payment}
        transparent
        animationType="slide"
        onRequestClose={handleDismiss}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="rounded-t-3xl bg-[#0D1526] px-6 pt-6 pb-10">
            <Text
              className="text-xl text-white"
              style={{ fontFamily: "SpaceGrotesk_700Bold" }}
            >
              Confirm Payment
            </Text>
            <Text
              className="mt-1 text-sm text-slate-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              Review the details before opening your wallet.
            </Text>

            {payment && (
              <View className="mt-5 gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <ConfirmRow
                  label="Destination"
                  value={payment.destination}
                  mono
                />
                {payment.amount && (
                  <ConfirmRow
                    label="Amount"
                    value={`${payment.amount} ${payment.assetCode ?? "XLM"}`}
                  />
                )}
                {payment.memo && (
                  <ConfirmRow
                    label={`Memo (${payment.memoType})`}
                    value={payment.memo}
                    mono
                  />
                )}
              </View>
            )}

            <Pressable
              className="mt-5 rounded-2xl bg-[#2663FF] py-4 items-center"
              disabled={launching}
              onPress={() => void handleConfirmPayment()}
            >
              {launching ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  className="text-white text-base"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Open Wallet to Pay
                </Text>
              )}
            </Pressable>

            <Pressable
              className="mt-3 rounded-2xl border border-white/20 py-4 items-center"
              onPress={handleDismiss}
            >
              <Text
                className="text-slate-300 text-base"
                style={{ fontFamily: "SpaceGrotesk_500Medium" }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ConfirmRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="gap-1">
      <Text
        className="text-xs uppercase tracking-[0.22em] text-slate-400"
        style={{ fontFamily: "SpaceGrotesk_500Medium" }}
      >
        {label}
      </Text>
      <Text
        className="text-sm text-white"
        numberOfLines={mono ? 2 : undefined}
        style={{
          fontFamily: mono
            ? "SpaceGrotesk_500Medium"
            : "SpaceGrotesk_400Regular",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
