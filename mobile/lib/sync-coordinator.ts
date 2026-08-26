interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = (mod.default ?? mod) as AsyncStorageLike;
} catch {
  const memoryStore: Record<string, string> = {};
  AsyncStorage = {
    getItem: async (key: string) => memoryStore[key] ?? null,
    setItem: async (key: string, value: string) => {
      memoryStore[key] = value;
    },
    removeItem: async (key: string) => {
      delete memoryStore[key];
    },
  };
}

import { DraftService } from './draft-service';
import { offlineQueue } from './offline-queue';
import { authService } from './auth-service';
import { useAuthStore } from '../hooks/use-auth-store';

const SYNC_STATUS_KEY = '@invoisio_sync_status';
const SYNC_HISTORY_KEY = '@invoisio_sync_history';
const LAST_SYNC_KEY = '@invoisio_last_sync';

/**
 * Parse persisted last-sync metadata into a valid epoch-milliseconds timestamp.
 * Accepts the canonical numeric form written by `saveLastSyncTime()` as well as
 * ISO-8601 strings. Returns `null` for missing, empty, or malformed values so
 * callers never render `Invalid Date` or a misleading sync status.
 */
export function parseLastSyncTimestamp(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let ts: number;
  if (/^\d+$/.test(trimmed)) {
    ts = Number(trimmed);
    if (!Number.isSafeInteger(ts)) return null;
  } else {
    ts = Date.parse(trimmed);
  }
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

/**
 * Format a last-sync timestamp for display. Returns `null` for missing or
 * invalid values so the UI can omit the label instead of showing nonsense.
 */
export function formatLastSyncTime(
  ts: number | null | undefined,
): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export type SyncOperationType = 
  | 'drafts' 
  | 'invoices' 
  | 'notifications' 
  | 'offline_queue'
  | 'auth_retry';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  error?: string;
  retryCount: number;
  details?: {
    totalItems?: number;
    processedItems?: number;
    failedItems?: number;
  };
}

export interface SyncStatus {
  isSyncing: boolean;
  currentOperation: SyncOperation | null;
  queue: SyncOperation[];
  lastSyncTime: number | null;
  overallProgress: number;
}

export interface SyncHistoryEntry {
  timestamp: number;
  duration: number;
  operations: SyncOperation[];
  success: boolean;
}

/**
 * SyncCoordinator manages all synchronization operations with:
 * - App-resume and connectivity-recovery triggers
 * - Retry logic with exponential backoff
 * - Partial failure handling
 * - User-facing observability
 */
class SyncCoordinator {
  private isSyncing = false;
  private currentOperation: SyncOperation | null = null;
  private operationQueue: SyncOperation[] = [];
  private listeners: ((status: SyncStatus) => void)[] = [];
  private maxRetries = 3;
  private retryDelay = 1000; // Base delay in ms
  private lastSyncTime: number | null = null;

  constructor() {
    // Load persisted last-sync metadata at startup so `getStatus()` reports a
    // trustworthy value immediately after app launch / offline recovery.
    void this.reloadLastSyncTime();
  }

  /**
   * Add a listener for sync status changes
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of status changes
   */
  private notifyListeners(): void {
    const status: SyncStatus = {
      isSyncing: this.isSyncing,
      currentOperation: this.currentOperation,
      queue: this.operationQueue,
      lastSyncTime: this.getLastSyncTime(),
      overallProgress: this.calculateProgress(),
    };
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * Calculate overall sync progress (0-100)
   */
  private calculateProgress(): number {
    if (!this.isSyncing && this.operationQueue.length === 0) return 0;
    
    const total = this.operationQueue.length + (this.currentOperation ? 1 : 0);
    if (total === 0) return 0;

    let completed = 0;
    this.operationQueue.forEach(op => {
      if (op.status === 'completed') completed++;
    });
    if (this.currentOperation?.status === 'completed') completed++;

    return Math.round((completed / total) * 100);
  }

  /**
   * Re-read persisted last-sync metadata from storage into memory.
   * Safe to call repeatedly; used on startup and app-resume recovery.
   */
  async reloadLastSyncTime(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
      this.lastSyncTime = parseLastSyncTimestamp(stored);
    } catch (error) {
      console.error('Failed to reload last sync time:', error);
      this.lastSyncTime = null;
    }
    this.notifyListeners();
  }

  /**
   * Get last sync time from memory (loaded from storage at startup/on save)
   */
  private getLastSyncTime(): number | null {
    return this.lastSyncTime;
  }

  /**
   * Save last sync time to storage and keep the in-memory value in sync
   */
  private async saveLastSyncTime(): Promise<void> {
    const now = Date.now();
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));
      this.lastSyncTime = now;
    } catch (error) {
      console.error('Failed to save last sync time:', error);
    }
  }

  /**
   * Save sync status to storage
   */
  private async saveSyncStatus(): Promise<void> {
    try {
      const status = {
        isSyncing: this.isSyncing,
        currentOperation: this.currentOperation,
        queue: this.operationQueue,
        lastSyncTime: this.getLastSyncTime(),
      };
      await AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('Failed to save sync status:', error);
    }
  }

  /**
   * Add sync operation to queue
   */
  private enqueueOperation(type: SyncOperationType, details?: SyncOperation['details']): string {
    const id = `${type}_${Date.now()}`;
    const operation: SyncOperation = {
      id,
      type,
      status: 'pending',
      startTime: Date.now(),
      retryCount: 0,
      details,
    } as SyncOperation;
    this.operationQueue.push(operation);
    this.notifyListeners();
    return id;
  }

  /**
   * Update operation status
   */
  private updateOperation(
    id: string,
    updates: Partial<SyncOperation>
  ): void {
    const index = this.operationQueue.findIndex(op => op.id === id);
    if (index !== -1) {
      this.operationQueue[index] = {
        ...this.operationQueue[index],
        ...updates,
      } as SyncOperation;
      this.notifyListeners();
    } else if (this.currentOperation?.id === id) {
      this.currentOperation = {
        ...this.currentOperation,
        ...updates,
      } as SyncOperation;
      this.notifyListeners();
    }
  }

  /**
   * Execute sync operation with retry logic
   */
  private async executeOperation(
    operation: SyncOperation,
    executor: () => Promise<void>
  ): Promise<void> {
    const { id, type } = operation;
    
    this.updateOperation(id, { status: 'in_progress' });
    this.currentOperation = { ...operation, status: 'in_progress' };
    this.notifyListeners();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await executor();
        
        // Success
        this.updateOperation(id, {
          status: 'completed',
          endTime: Date.now(),
        });
        this.currentOperation = null;
        this.notifyListeners();
        return;
      } catch (error) {
        lastError = error as Error;
        console.error(`Sync operation ${type} failed (attempt ${attempt + 1}):`, error);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.updateOperation(id, {
      status: 'failed',
      endTime: Date.now(),
      error: lastError?.message || 'Unknown error',
      retryCount: this.maxRetries,
    });
    this.currentOperation = null;
    this.notifyListeners();
  }

  /**
   * Sync local drafts with server
   */
  private async syncDrafts(token: string): Promise<void> {
    const operationId = this.enqueueOperation('drafts');
    
    try {
      const syncStatus = await DraftService.getSyncStatus();
      this.updateOperation(operationId, {
        details: {
          totalItems: syncStatus.unsynced,
          processedItems: 0,
          failedItems: 0,
        },
      });

      await DraftService.syncLocalDrafts(token);
      
      const finalStatus = await DraftService.getSyncStatus();
      this.updateOperation(operationId, {
        details: {
          totalItems: syncStatus.unsynced,
          processedItems: syncStatus.unsynced - finalStatus.unsynced,
          failedItems: finalStatus.unsynced,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process offline queue
   */
  private async processOfflineQueue(): Promise<void> {
    const operationId = this.enqueueOperation('offline_queue');
    
    const queueSize = offlineQueue.getQueueSize();
    this.updateOperation(operationId, {
      details: {
        totalItems: queueSize,
        processedItems: 0,
        failedItems: 0,
      },
    });

    let processed = 0;
    let failed = 0;

    await offlineQueue.processQueue({
      onSuccess: () => {
        processed++;
        this.updateOperation(operationId, {
          details: {
            totalItems: queueSize,
            processedItems: processed,
            failedItems: failed,
          },
        });
      },
      onFailure: () => {
        failed++;
        this.updateOperation(operationId, {
          details: {
            totalItems: queueSize,
            processedItems: processed,
            failedItems: failed,
          },
        });
      },
    });
  }

  /**
   * Retry pending auth operations
   */
  private async retryAuth(): Promise<void> {
    this.enqueueOperation('auth_retry');
    
    try {
      const loginResult = await authService.retryPendingOperation();
      if (loginResult) {
        await useAuthStore.getState().setAuth(
          loginResult.response.accessToken,
          loginResult.response.refreshToken,
          loginResult.publicKey
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check for stale invoice status updates
   */
  private async syncInvoiceStatus(_token: string): Promise<void> {
    const operationId = this.enqueueOperation('invoices');
    
    try {
      // This would typically fetch recent invoices and check for status updates
      // For now, we'll mark it as completed since the invoice list already refreshes
      this.updateOperation(operationId, {
        details: {
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Catch up on pending notifications
   */
  private async syncNotifications(_token: string): Promise<void> {
    const operationId = this.enqueueOperation('notifications');
    
    try {
      // This would typically fetch recent notifications
      // For now, we'll mark it as completed
      this.updateOperation(operationId, {
        details: {
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Main sync orchestration method
   */
  async triggerSync(options?: {
    skipAuth?: boolean;
    skipDrafts?: boolean;
    skipQueue?: boolean;
    skipInvoices?: boolean;
    skipNotifications?: boolean;
  }): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();
    await this.saveSyncStatus();

    const { accessToken } = useAuthStore.getState();
    if (!accessToken) {
      console.log('No access token, skipping sync');
      this.isSyncing = false;
      this.notifyListeners();
      return;
    }

    const startTime = Date.now();

    try {
      // Step 1: Retry auth if needed
      if (!options?.skipAuth) {
        const authOpId = this.enqueueOperation('auth_retry');
        try {
          const authOp = this.operationQueue.find(op => op.id === authOpId)!;
          await this.executeOperation(authOp, () => this.retryAuth());
        } catch (error) {
          console.error('Auth retry failed, continuing with other sync operations');
        }
      }

      // Step 2: Sync drafts
      if (!options?.skipDrafts) {
        const draftsOpId = this.enqueueOperation('drafts');
        try {
          const draftsOp = this.operationQueue.find(op => op.id === draftsOpId)!;
          await this.executeOperation(draftsOp, () => this.syncDrafts(accessToken));
        } catch (error) {
          console.error('Draft sync failed, continuing with other operations');
        }
      }

      // Step 3: Process offline queue
      if (!options?.skipQueue) {
        const queueOpId = this.enqueueOperation('offline_queue');
        try {
          const queueOp = this.operationQueue.find(op => op.id === queueOpId)!;
          await this.executeOperation(queueOp, () => this.processOfflineQueue());
        } catch (error) {
          console.error('Offline queue processing failed, continuing with other operations');
        }
      }

      // Step 4: Sync invoice status
      if (!options?.skipInvoices) {
        const invoicesOpId = this.enqueueOperation('invoices');
        try {
          const invoicesOp = this.operationQueue.find(op => op.id === invoicesOpId)!;
          await this.executeOperation(invoicesOp, () => this.syncInvoiceStatus(accessToken));
        } catch (error) {
          console.error('Invoice status sync failed, continuing with other operations');
        }
      }

      // Step 5: Sync notifications
      if (!options?.skipNotifications) {
        const notificationsOpId = this.enqueueOperation('notifications');
        try {
          const notificationsOp = this.operationQueue.find(op => op.id === notificationsOpId)!;
          await this.executeOperation(notificationsOp, () => this.syncNotifications(accessToken));
        } catch (error) {
          console.error('Notification sync failed, continuing with other operations');
        }
      }

      // Record successful sync
      await this.recordSyncHistory(startTime, this.operationQueue.filter(op => op.status !== 'pending'), true);
      await this.saveLastSyncTime();

    } catch (error) {
      console.error('Sync coordinator error:', error);
      await this.recordSyncHistory(startTime, this.operationQueue.filter(op => op.status !== 'pending'), false);
    } finally {
      this.isSyncing = false;
      this.operationQueue = [];
      this.currentOperation = null;
      await this.saveSyncStatus();
      this.notifyListeners();
    }
  }

  /**
   * Record sync history for debugging and user feedback
   */
  private async recordSyncHistory(
    startTime: number,
    _operations: SyncOperation[],
    success: boolean
  ): Promise<void> {
    try {
      const entry: SyncHistoryEntry = {
        timestamp: startTime,
        duration: Date.now() - startTime,
        operations: this.operationQueue.filter(op => 
          op.status !== 'pending'
        ),
        success,
      };

      const history = await this.getSyncHistory();
      history.unshift(entry);
      
      // Keep only last 50 entries
      const trimmedHistory = history.slice(0, 50);
      
      await AsyncStorage.setItem(
        SYNC_HISTORY_KEY,
        JSON.stringify(trimmedHistory)
      );
    } catch (error) {
      console.error('Failed to record sync history:', error);
    }
  }

  /**
   * Get sync history
   */
  async getSyncHistory(): Promise<SyncHistoryEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(SYNC_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get sync history:', error);
      return [];
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      isSyncing: this.isSyncing,
      currentOperation: this.currentOperation,
      queue: this.operationQueue,
      lastSyncTime: this.getLastSyncTime(),
      overallProgress: this.calculateProgress(),
    };
  }

  /**
   * Clear sync history
   */
  async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SYNC_HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear sync history:', error);
    }
  }

  /**
   * Reset sync state (for testing or error recovery)
   */
  async reset(): Promise<void> {
    this.isSyncing = false;
    this.currentOperation = null;
    this.operationQueue = [];
    await this.saveSyncStatus();
    this.notifyListeners();
  }
}

// Export singleton instance
export const syncCoordinator = new SyncCoordinator();
