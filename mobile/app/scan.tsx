import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  parseQrCode,
  type ParseQrErrorCode,
  type ParsedPayment,
} from "../lib/parse-qr";

const QR_ERROR_TITLES: Record<ParseQrErrorCode, string> = {
  "unsupported-format": "Unsupported QR code",
  "missing-destination": "Incomplete QR code",
  "invalid-destination": "Invalid destination",
};

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
    const blocked = !permission.canAskAgain;

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
          {blocked
            ? "Camera access is blocked. Open your device settings to allow Invoisio to use the camera for scanning Stellar payment QR codes."
            : "Allow camera access to scan Stellar payment QR codes."}
        </Text>
        {blocked ? (
          <Pressable
            className="mt-6 rounded-2xl bg-[#2663FF] px-8 py-4"
            onPress={() => void Linking.openSettings()}
          >
            <Text
              className="text-white"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              Open Settings
            </Text>
          </Pressable>
        ) : (
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
        )}
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

    if ("code" in result) {
      // cancelable:false guarantees the user picks an action, so the scanner
      // can never be left silently disabled by an outside-tap dismissal.
      Alert.alert(
        QR_ERROR_TITLES[result.code],
        result.message,
        [
          {
            text: "Try again",
            onPress: () => {
              processingRef.current = false;
            },
          },
          {
            text: "Stop scanning",
            style: "cancel",
            onPress: () => {
              processingRef.current = false;
              router.back();
            },
          },
        ],
        { cancelable: false },
      );
      return;
    }

    setPayment(result);
    setScanned(true);
  };

  const sharePaymentLink = async (payment: ParsedPayment) => {
    try {
      await Share.share({
        message: payment.sep0007Uri,
        title: "Stellar payment",
      });
    } catch {
      Alert.alert(
        "Unable to share",
        "The payment link could not be shared. Please try again.",
        [{ text: "OK" }],
      );
    }
  };

  const openWallet = async (payment: ParsedPayment) => {
    const canOpen = await Linking.canOpenURL(payment.sep0007Uri);
    if (!canOpen) {
      Alert.alert(
        "No wallet found",
        "No Stellar wallet app (e.g. LOBSTR) is installed that can handle this payment link. Share the link to open it in a wallet or browser, or install a Stellar wallet and try again.",
        [
          {
            text: "Share link",
            onPress: () => void sharePaymentLink(payment),
          },
          {
            text: "Try again",
            onPress: () => void openWallet(payment),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    await Linking.openURL(payment.sep0007Uri);
  };

  const handleConfirmPayment = async () => {
    if (!payment) return;
    setLaunching(true);

    try {
      await openWallet(payment);
    } catch {
      Alert.alert(
        "Couldn't open wallet",
        "The wallet app could not be opened. Try again, or share the payment link to open it elsewhere.",
        [
          {
            text: "Try again",
            onPress: () => void handleConfirmPayment(),
          },
          {
            text: "Share link",
            onPress: () => void sharePaymentLink(payment),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
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
