import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
} from "react-native";
import { useConnectivityContext } from "./ConnectivityProvider";

/**
 * SyncStatusBanner provides user-facing feedback about sync operations
 * Shows current sync status, progress, and any errors
 */
export function SyncStatusBanner() {
  const { syncStatus, triggerSync } = useConnectivityContext();

  const currentOperation = syncStatus.currentOperation;
  const hasErrors = syncStatus.queue.some((op) => op.status === "failed");
  const visible = syncStatus.isSyncing || syncStatus.queue.length > 0;

  // Announce sync completion / failures instead of relying on colour alone.
  // Note: hooks must run before the early return below.
  const prevVisibleRef = useRef(visible);
  const prevHadErrorsRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && !hasErrors) {
      AccessibilityInfo.announceForAccessibility("Syncing your data");
    } else if (
      !visible &&
      prevVisibleRef.current &&
      !prevHadErrorsRef.current
    ) {
      AccessibilityInfo.announceForAccessibility("Sync completed");
    }
    prevVisibleRef.current = visible;
    prevHadErrorsRef.current = hasErrors;
  }, [visible, hasErrors]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={getOperationLabel(currentOperation?.type ?? "")}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        hasErrors ? styles.errorContainer : styles.normalContainer,
      ]}
    >
      <View style={styles.content}>
        {currentOperation ? (
          <>
            <Text style={styles.statusText}>
              {getOperationLabel(currentOperation.type)}
            </Text>
            {syncStatus.overallProgress > 0 && (
              <Text style={styles.progressText}>
                {syncStatus.overallProgress}%
              </Text>
            )}
          </>
        ) : hasErrors ? (
          <Text style={styles.statusText}>Some sync operations failed</Text>
        ) : (
          <Text style={styles.statusText}>Preparing sync...</Text>
        )}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={hasErrors ? "Retry sync" : "Sync now"}
        style={styles.retryButton}
        onPress={() => triggerSync()}
      >
        <Text style={styles.retryButtonText}>
          {hasErrors ? "Retry" : "Sync"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function getOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    drafts: "Syncing drafts...",
    invoices: "Updating invoices...",
    notifications: "Checking notifications...",
    offline_queue: "Processing queued requests...",
    auth_retry: "Verifying authentication...",
  };
  return labels[type] || "Syncing...";
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  normalContainer: {
    backgroundColor: "#1a1d2d",
    borderWidth: 1,
    borderColor: "#2a2d3d",
  },
  errorContainer: {
    backgroundColor: "#2d1a1a",
    borderWidth: 1,
    borderColor: "#3d2a2a",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  progressText: {
    color: "#6366f1",
    fontSize: 14,
    fontFamily: "SpaceGrotesk_600SemiBold",
    marginLeft: 8,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#6366f1",
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
});
