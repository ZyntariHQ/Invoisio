import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { AppState } from "react-native";
import { useConnectivity } from "../hooks/use-connectivity";
import { offlineQueue } from "../lib/offline-queue";
import { authService } from "../lib/auth-service";
import { useAuthStore } from "../hooks/use-auth-store";
import { syncCoordinator } from "../lib/sync-coordinator";

interface ConnectivityContextValue {
  isOnline: boolean;
  isDegraded: boolean;
  queueSize: number;
  processQueue: () => Promise<void>;
  syncStatus: import("../lib/sync-coordinator").SyncStatus;
  triggerSync: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextValue>({
  isOnline: true,
  isDegraded: false,
  queueSize: 0,
  processQueue: async () => {},
  syncStatus: syncCoordinator.getStatus(),
  triggerSync: async () => {},
});

export function ConnectivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isOffline, isDegraded } = useConnectivity();
  const [queueSize, setQueueSize] = React.useState(0);
  const [syncStatus, setSyncStatus] = React.useState(syncCoordinator.getStatus());
  const appState = useRef<string>(AppState.currentState);

  const processQueue = useCallback(async () => {
    if (isOffline) return;

    try {
      const loginResult = await authService.retryPendingOperation();
      if (loginResult) {
        await useAuthStore
          .getState()
          .setAuth(loginResult.response.accessToken, loginResult.response.refreshToken, loginResult.publicKey);
      } else {
        const { accessToken, clearAuth } = useAuthStore.getState();
        if (accessToken) {
          const status = await authService.verifyToken(accessToken);
          if (status === "invalid") await clearAuth();
        }
      }

      await offlineQueue.processQueue({
        onSuccess: (request) => {
          console.log(`Request ${request.id} processed successfully`);
        },
        onFailure: (request, error) => {
          console.error(`Request ${request.id} failed after retries:`, error);
        },
      });

      setQueueSize(offlineQueue.getQueueSize());
    } catch (error) {
      console.error("Error processing queue:", error);
    }
  }, [isOffline]);

  const triggerSync = useCallback(async () => {
    if (isOffline) return;
    await syncCoordinator.triggerSync();
  }, [isOffline]);

  // Subscribe to queue changes
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe(() => {
      setQueueSize(offlineQueue.getQueueSize());
    });
    setQueueSize(offlineQueue.getQueueSize());
    return unsubscribe;
  }, []);

  // Subscribe to sync coordinator status changes
  useEffect(() => {
    const unsubscribe = syncCoordinator.subscribe((status) => {
      setSyncStatus(status);
    });
    setSyncStatus(syncCoordinator.getStatus());
    return unsubscribe;
  }, []);

  // Process queue when coming online - use sync coordinator
  useEffect(() => {
    if (!isOffline) {
      void triggerSync();
    }
  }, [isOffline, triggerSync]);

  // Handle app state changes (background/foreground) - use sync coordinator
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: string) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active" &&
          !isOffline
        ) {
          // App came to foreground and we're online - trigger full sync
          void triggerSync();
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [isOffline, triggerSync]);

  const value: ConnectivityContextValue = {
    isOnline: !isOffline,
    isDegraded,
    queueSize,
    processQueue,
    syncStatus,
    triggerSync,
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
