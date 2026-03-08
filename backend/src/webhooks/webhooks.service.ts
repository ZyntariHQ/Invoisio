import { Injectable, Logger } from "@nestjs/common";

/**
 * Webhooks service — enqueues and dispatches webhook notifications
 * for invoice status changes.
 *
 * Current implementation logs webhook events. Replace the body of
 * `dispatchWebhook()` with an HTTP call to your webhook endpoint
 * when you're ready to integrate with external consumers.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Enqueue a webhook notification for an invoice event.
   * @param invoiceId - Invoice UUID
   * @param status    - New invoice status (e.g. "paid", "pending", "overdue")
   * @param txHash    - Optional Stellar / Soroban transaction hash
   */
  async enqueueWebhook(
    invoiceId: string,
    status: string,
    txHash?: string | null,
  ): Promise<void> {
    this.logger.log(
      `Webhook enqueued — invoice: ${invoiceId}, status: ${status}` +
        (txHash ? `, txHash: ${txHash}` : ""),
    );

    // TODO: Persist to a webhook_events table and/or push to a queue
    // for reliable delivery. For now we fire-and-forget.
    await this.dispatchWebhook({ invoiceId, status, txHash: txHash ?? null });
  }

  /**
   * Dispatch a single webhook payload.
   * Replace this stub with a real HTTP POST to registered webhook URLs.
   */
  private async dispatchWebhook(payload: {
    invoiceId: string;
    status: string;
    txHash: string | null;
  }): Promise<void> {
    // TODO: POST payload to registered webhook endpoints
    this.logger.debug(`Webhook dispatched — ${JSON.stringify(payload)}`);
  }
}
