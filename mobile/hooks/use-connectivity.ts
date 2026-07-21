import { useEffect, useState } from "react";
import { NetInfo, useNetInfo } from "@react-native-community/netinfo";
import { Platform } from "react-native";

export type ConnectivityState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isOffline: boolean;
  connectionType: string | null;
  isDegraded: boolean;
};

/**
 * Hook to monitor network connectivity state with degradation detection
 * 
 * Provides real-time connectivity status including:
 * - Online/Offline detection
 * - Internet reachability
 * - Degraded connectivity (slow or unstable)
 * - Connection type (wifi, cellular, etc.)
 */
export function useConnectivity(): ConnectivityState {
  const netInfo = useNetInfo();
  const [isDegraded, setIsDegraded] = useState(false);

  useEffect(() => {
    // Detect degraded connectivity: connected but not reachable,
    // or frequent disconnections (simplified)
    if (netInfo.isConnected && netInfo.isInternetReachable === false) {
      setIsDegraded(true);
    } else if (netInfo.isConnected && netInfo.isInternetReachable === true) {
      setIsDegraded(false);
    }
  }, [netInfo.isConnected, netInfo.isInternetReachable]);

  return {
    isConnected: netInfo.isConnected ?? false,
    isInternetReachable: netInfo.isInternetReachable ?? null,
    isOffline: !(netInfo.isConnected ?? false),
    connectionType: netInfo.type ?? null,
    isDegraded,
  };
}