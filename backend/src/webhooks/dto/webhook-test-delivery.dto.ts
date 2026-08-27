/**
 * Result returned to the merchant after a signed test webhook delivery attempt.
 *
 * Test deliveries are entirely transient – they are never written to the
 * WebhookDelivery table and therefore never appear in production delivery
 * history or the dead-letter queue.
 */
export class WebhookTestDeliveryResultDto {
  /** Whether the endpoint responded with an HTTP 2xx status code. */
  success: boolean;

  /**
   * HTTP status code returned by the merchant endpoint.
   * null when the endpoint was unreachable (network error / timeout).
   */
  httpStatus: number | null;

  /** Round-trip latency in milliseconds. */
  durationMs: number;

  /**
   * Human-readable failure reason.
   * Present only when `success` is false.
   */
  failureReason: string | null;

  /** ISO-8601 timestamp of when the test delivery was sent. */
  sentAt: string;
}

/**
 * Sample payload body sent during a test delivery.
 * Clearly marked as a test event so merchants can distinguish it from
 * real production events.
 */
export interface WebhookTestPayload {
  event: "test";
  invoiceId: "__test__";
  status: "test";
  txHash: null;
  timestamp: string;
  description: "This is a signed test webhook delivery from Invoisio. No action required.";
}
