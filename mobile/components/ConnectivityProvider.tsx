import React, { createContext, useContext, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useConnectivity } from "../hooks/use-connectivity";
import { offlineQueue } from "../lib/offline-queue";
import { AuthService as authService } from "../lib/auth-service";
import { useAuthStore } from "../hooks/use-auth-store";

interface ConnectivityContextValue {
  isOnline: boolean;
  isDegraded: boolean;
  queueSize: number;
  processQueue: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextValue>({
  isOnline: true,
  isDegraded: false,
  queueSize: 0,
  processQueue: async () => {},
});

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const { isOffline, isDegraded } = useConnectivity();
  const [queueSize, setQueueSize] = React.useState(0);
  const appState = useRef(AppState.currentState);
  const { accessToken } = useAuthStore();

  // Subscribe to queue changes
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe(() => {
      setQueueSize(offlineQueue.getQueueSize());
    });
    setQueueSize(offlineQueue.getQueueSize());
    return unsubscribe;
  }, []);

  // Process queue when coming online
  useEffect(() => {
    if (!isOffline) {
      processQueue();
    }
  }, [isOffline]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        !isOffline
      ) {
        // App came to foreground and we're online - process queue
        processQueue();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [isOffline]);

  const processQueue = async () => {
    if (isOffline) return;

    try {
      // Try to retry pending login first
      const loginResult = await authService.retryPendingLogin();
      if (loginResult) {
        // Update auth store if login succeeded
        useAuthStore.getState().setTokens(loginResult.accessToken);
      }

      // Process the offline queue
      await offlineQueue.processQueue(
        (request) => {
          console.log(`Request ${request.id} processed successfully`);
          // Optionally invalidate relevant queries
        },
        (request, error) => {
          console.error(`Request ${request.id} failed after retries:`, error);
        }
      );

      setQueueSize(offlineQueue.getQueueSize());
    } catch (error) {
      console.error("Error processing queue:", error);
    }
  };

  const value: ConnectivityContextValue = {
    isOnline: !isOffline,
    isDegraded,
    queueSize,
    processQueue,
  };

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivityContext() {
  return useContext(ConnectivityContext);
}