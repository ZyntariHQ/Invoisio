import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface QueuedRequest {
  id: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

const QUEUE_KEY = "@offline_queue";
const MAX_RETRIES = 3;

class OfflineQueueManager {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private listeners: (() => void)[] = [];

  constructor() {
    this.loadQueue();
  }

  /**
   * Load the queue from persistent storage
   */
  private async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
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
  private async saveQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }

  /**
   * Add a request to the offline queue
   */
  async enqueue(
    url: string,
    method: QueuedRequest["method"],
    data?: any,
    headers?: Record<string, string>
  ): Promise<string> {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const request: QueuedRequest = {
      id,
      url,
      method,
      data,
      headers,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
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
  async clearQueue() {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Process the queue - retry all queued requests
   */
  async processQueue(
    onSuccess?: (request: QueuedRequest, response: any) => void,
    onFailure?: (request: QueuedRequest, error: any) => void
  ) {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const toProcess = [...this.queue];
    for (const request of toProcess) {
      try {
        // Skip if already processed or too many retries
        if (request.retryCount >= request.maxRetries) continue;
        await this.processRequest(request);
        onSuccess?.(request, null);
        await this.dequeue(request.id);
      } catch (error) {
        request.retryCount += 1;
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
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueueManager();