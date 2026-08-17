import { useState, useEffect } from 'react';
import { syncCoordinator, type SyncStatus } from '../lib/sync-coordinator';

/**
 * Hook to access sync coordinator status and trigger sync operations
 * Provides reactive updates when sync status changes
 */
export function useSyncCoordinator() {
  const [status, setStatus] = useState<SyncStatus>(syncCoordinator.getStatus());

  useEffect(() => {
    const unsubscribe = syncCoordinator.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const triggerSync = async () => {
    await syncCoordinator.triggerSync();
  };

  const getHistory = async () => {
    return await syncCoordinator.getSyncHistory();
  };

  const clearHistory = async () => {
    await syncCoordinator.clearHistory();
  };

  const reset = async () => {
    await syncCoordinator.reset();
  };

  return {
    status,
    triggerSync,
    getHistory,
    clearHistory,
    reset,
  };
}
