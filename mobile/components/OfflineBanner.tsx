import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { useConnectivity } from "../hooks/use-connectivity";
import { offlineQueue } from "../lib/offline-queue";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BannerType = "offline" | "degraded" | "retry";

interface OfflineBannerProps {
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function OfflineBanner({ onRetry, onDismiss }: OfflineBannerProps) {
  const { isOffline, isDegraded, isInternetReachable } = useConnectivity();
  const [queueSize, setQueueSize] = useState(0);
  const [slideAnim] = useState(new Animated.Value(-100));
  const insets = useSafeAreaInsets();

  // Subscribe to queue changes
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe(() => {
      setQueueSize(offlineQueue.getQueueSize());
    });
    setQueueSize(offlineQueue.getQueueSize());
    return unsubscribe;
  }, []);

  // Animate banner in/out
  useEffect(() => {
    const shouldShow = isOffline || isDegraded || queueSize > 0;
    Animated.spring(slideAnim, {
      toValue: shouldShow ? 0 : -100,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [isOffline, isDegraded, queueSize]);

  const getBannerType = (): BannerType => {
    if (isOffline) return "offline";
    if (isDegraded) return "degraded";
    if (queueSize > 0) return "retry";
    return "retry";
  };

  const getMessage = () => {
    if (isOffline) {
      return queueSize > 0
        ? `You're offline. ${queueSize} request(s) queued.`
        : "You're offline. Reconnect to continue.";
    }
    if (isDegraded) {
      return "Network is slow or unstable. Some operations may fail.";
    }
    if (queueSize > 0) {
      return `${queueSize} request(s) waiting to sync.`;
    }
    return "";
  };

  const getActionText = () => {
    if (isOffline) return "Retry when online";
    if (isDegraded) return "Dismiss";
    return `Retry (${queueSize})`;
  };

  const handleAction = () => {
    if (isOffline) {
      onDismiss?.();
      return;
    }
    if (isDegraded) {
      onDismiss?.();
      return;
    }
    // Retry queued requests
    onRetry?.();
  };

  const shouldShow = isOffline || isDegraded || queueSize > 0;
  if (!shouldShow) return null;

  const bannerType = getBannerType();
  const backgroundColor =
    bannerType === "offline"
      ? "#DC2626"
      : bannerType === "degraded"
      ? "#F59E0B"
      : "#3B82F6";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          paddingTop: Platform.OS === "ios" ? insets.top : 0,
          backgroundColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.message}>{getMessage()}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleAction}>
          <Text style={styles.actionText}>{getActionText()}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  message: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
    marginRight: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});