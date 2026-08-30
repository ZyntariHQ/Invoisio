import React, { useEffect, useRef } from "react";
import {
  Animated,
  Text,
  StyleSheet,
  Platform,
  AccessibilityInfo,
} from "react-native";
import { useConnectivity } from "../hooks/use-connectivity";

export function ConnectivityToast() {
  const { isOffline, isDegraded } = useConnectivity();
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (!isOffline && !isDegraded) {
      // Online - hide toast
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Offline or degraded - show toast
      Animated.spring(translateY, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [isOffline, isDegraded]);

  const getMessage = () => {
    if (isOffline) return "📡 You are offline";
    if (isDegraded) return "⚠️ Network is unstable";
    return "";
  };

  const getAnnouncement = () => {
    if (isOffline) return "You are offline";
    if (isDegraded) return "Network is unstable";
    return "";
  };

  // Announce connectivity loss instead of relying on colour alone. The
  // announcement text is computed inline so every referenced value is
  // covered by the deps list; wasHidden guards against duplicates.
  const wasHidden = useRef(true);
  useEffect(() => {
    const shouldShow = isOffline || isDegraded;
    if (shouldShow && wasHidden.current) {
      wasHidden.current = false;
      AccessibilityInfo.announceForAccessibility(
        isOffline ? "You are offline" : "Network is unstable",
      );
    } else if (!shouldShow) {
      wasHidden.current = true;
    }
  }, [isOffline, isDegraded]);

  const backgroundColor = isOffline ? "#DC2626" : "#F59E0B";

  if (!isOffline && !isDegraded) return null;

  return (
    <Animated.View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={getAnnouncement()}
      accessibilityLiveRegion="assertive"
      style={[styles.container, { backgroundColor, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{getMessage()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});