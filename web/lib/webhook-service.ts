import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebhookSecretMetadata {
  hasSecret: boolean;
  /** e.g. "abcd...wxyz" – the raw secret is never returned from this endpoint */
  maskedSecret: string | null;
  secretLength: number | null;
}

export interface WebhookSecretRotationResult {
  /** Full raw secret – returned exactly once after rotation. Copy and store it. */
  secret: string;
  metadata: WebhookSecretMetadata;
}

export interface TestSendResult {
  success: boolean;
  httpStatus: number | null;
  error: string | null;
}

export type DeliveryStatus = 'pending' | 'success' | 'failed';
export type DeadLetterStatus =
  | 'pending_retry'
  | 'requeued'
  | 'recovered'
  | string;

export interface WebhookDelivery {
  id: string;
  url: string;
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  invoice: { id: string; invoiceNumber: string | null } | null;
}

export interface WebhookDeadLetter {
  id: string;
  url: string;
  status: DeadLetterStatus;
  failedAttempts: number;
  lastError: string | null;
  lastHttpStatus: number | null;
  exhaustedAt: string;
  createdAt: string;
  invoice: { id: string; invoiceNumber: string | null } | null;
}

export interface WebhookDeliveriesResult {
  deliveries: WebhookDelivery[];
  deadLetters: WebhookDeadLetter[];
}

// ── Service ────────────────────────────────────────────────────────────────

export const WebhookService = {
  /**
   * Fetch masked metadata for the current merchant's signing secret.
   * The raw secret is never returned.
   */
  async getSecretMetadata(): Promise<WebhookSecretMetadata> {
    try {
      const res = await apiClient.get<WebhookSecretMetadata>('/webhooks/secret');
      return res.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /**
   * Generate and persist a fresh webhook signing secret.
   * The raw secret is returned once – copy it immediately.
   * Requires OWNER or ADMIN role.
   */
  async rotateSecret(): Promise<WebhookSecretRotationResult> {
    try {
      const res = await apiClient.post<WebhookSecretRotationResult>(
        '/webhooks/secret/rotate',
      );
      return res.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /**
   * Fire a synthetic test payload to the configured webhook URL.
   * Not persisted. Returns success/failure and HTTP status.
   * Requires OWNER or ADMIN role.
   */
  async testSend(): Promise<TestSendResult> {
    try {
      const res = await apiClient.post<TestSendResult>('/webhooks/test-send');
      return res.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /**
   * Fetch recent webhook deliveries and dead-letters for the current merchant.
   */
  async getDeliveries(limit = 20): Promise<WebhookDeliveriesResult> {
    try {
      const res = await apiClient.get<WebhookDeliveriesResult>(
        '/webhooks/deliveries',
        { params: { limit } },
      );
      return res.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
