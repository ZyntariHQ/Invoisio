export interface QueuedRequestError {
  message: string;
  status?: number;
  timestamp: number;
}

export interface QueuedRequest {
  id: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  descriptorTag?: string;
  lastError?: QueuedRequestError;
}

export interface ProcessQueueOptions {
  onSuccess?: (request: QueuedRequest, response: any) => void;
  onFailure?: (request: QueuedRequest, error: any) => void;
  getAuthToken?: () => Promise<string | null> | string | null;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

const memoryStore: Record<string, string> = {};
const fallbackStorage: StorageAdapter = {
  getItem: async (key: string) => memoryStore[key] ?? null,
  setItem: async (key: string, value: string) => {
    memoryStore[key] = value;
  },
  removeItem: async (key: string) => {
    delete memoryStore[key];
  },
};

const QUEUE_KEY = "@offline_queue";
const MAX_RETRIES = 3;

export class OfflineQueueManager {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private listeners: (() => void)[] = [];
  private storage: StorageAdapter;

  constructor(customStorage?: StorageAdapter) {
    if (customStorage) {
      this.storage = customStorage;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const asyncStorage = require("@react-native-async-storage/async-storage");
        this.storage = asyncStorage.default ?? asyncStorage;
      } catch {
        this.storage = fallbackStorage;
      }
    }
    void this.loadQueue();
  }

  /**
   * Load the queue from persistent storage
   */
  async loadQueue(): Promise<void> {
    try {
      const stored = await this.storage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.queue = this.queue.filter(
          (req) => req.retryCount < req.maxRetries
        );
      }
    } catch (error) {
      console.error("Failed to load offline queue:", error);
      this.queue = [];
    }
  }

  /**
   * Save the queue to persistent storage
   */
  private async saveQueue(): Promise<void> {
    try {
      await this.storage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }

  /**
   * Add a request to the offline queue with React Native-safe descriptors
   */
  async enqueue(
    url: string,
    method: QueuedRequest["method"] = "POST",
    data?: any,
    headers?: Record<string, string>,
    descriptorTag?: string
  ): Promise<string> {
    if (!url || typeof url !== "string") {
      throw new Error("Cannot enqueue request: URL must be a valid non-empty string");
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const request: QueuedRequest = {
      id,
      url,
      method,
      data,
      headers: headers ?? {},
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      descriptorTag,
    };

    this.queue.push(request);
    await this.saveQueue();
    this.notifyListeners();
    return id;
  }

  /**
   * Remove a request from the queue
   */
  async dequeue(id: string): Promise<QueuedRequest | undefined> {
    const index = this.queue.findIndex((req) => req.id === id);
    if (index === -1) return undefined;
    const request = this.queue[index];
    this.queue.splice(index, 1);
    await this.saveQueue();
    this.notifyListeners();
    return request;
  }

  /**
   * Get all queued requests
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue];
  }

  /**
   * Get the number of queued requests
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Process the queue - replay all queued requests with updated auth context
   */
  async processQueue(options: ProcessQueueOptions = {}): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const { onSuccess, onFailure, getAuthToken } = options;

    let dynamicToken: string | null = null;
    if (getAuthToken) {
      try {
        dynamicToken = await getAuthToken();
      } catch (err) {
        console.warn("Failed to retrieve dynamic auth token for offline replay:", err);
      }
    }

    const toProcess = [...this.queue];
    for (const request of toProcess) {
      try {
        if (request.retryCount >= request.maxRetries) {
          continue;
        }

        // Apply updated auth token if available and requested
        if (dynamicToken) {
          request.headers = {
            ...request.headers,
            Authorization: `Bearer ${dynamicToken}`,
          };
        }

        const response = await this.processRequest(request);
        onSuccess?.(request, response);
        await this.dequeue(request.id);
      } catch (err) {
        request.retryCount += 1;
        const error = err as Error;
        
        request.lastError = {
          message: error.message || "Unknown replay network error",
          status: (error as any).status,
          timestamp: Date.now(),
        };

        if (request.retryCount >= request.maxRetries) {
          onFailure?.(request, error);
          await this.dequeue(request.id);
        } else {
          await this.saveQueue();
        }
        this.notifyListeners();
      }
    }

    this.isProcessing = false;
    this.notifyListeners();
  }

  private async processRequest(request: QueuedRequest): Promise<any> {
    const { url, method, data, headers } = request;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (data && method !== "GET" && method !== "DELETE") {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const err: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      throw err;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueueManager();