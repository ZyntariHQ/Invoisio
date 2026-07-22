import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useConnectivity } from "../hooks/use-connectivity";

export function OnlineStatusIndicator() {
  const { isConnected, isInternetReachable, isDegraded } = useConnectivity();

  let statusColor = "#22C55E"; // green
  let statusText = "Online";

  if (!isConnected) {
    statusColor = "#DC2626"; // red
    statusText = "Offline";
  } else if (isDegraded || isInternetReachable === false) {
    statusColor = "#F59E0B"; // yellow
    statusText = "Degraded";
  }

  return (
    <View style={[styles.container, { backgroundColor: statusColor }]}>
      <View style={styles.indicator} />
      <Text style={styles.text}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#22C55E",
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});