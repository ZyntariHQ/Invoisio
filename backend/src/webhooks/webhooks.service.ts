import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import * as crypto from "crypto";

export interface WebhookSecretMetadata {
  hasSecret: boolean;
  maskedSecret: string | null;
  secretLength: number | null;
}

export interface WebhookSecretRotationResult {
  secret: string;
  metadata: WebhookSecretMetadata;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return masked metadata for the merchant's current webhook signing secret.
   *
   * The raw secret is never returned from read methods.
   */
  async getWebhookSecretMetadata(
    userId: string,
    merchantId: string,
  ): Promise<WebhookSecretMetadata> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, merchantId },
      select: { webhookSecret: true },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return this.toSecretMetadata(user.webhookSecret ?? null);
  }

  /**
   * Generate, persist, and return a brand new webhook signing secret.
   *
   * Overwriting the stored secret immediately invalidates the previous signing
   * secret for any future webhook deliveries.
   */
  async rotateWebhookSecret(
    userId: string,
    merchantId: string,
  ): Promise<WebhookSecretRotationResult> {
    const secret = crypto.randomBytes(32).toString("hex");
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, merchantId },
      data: {
        webhookSecret: secret,
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException("User not found.");
    }

    return {
      secret,
      metadata: this.toSecretMetadata(secret),
    };
  }

  /**
   * Enqueues a webhook delivery for an invoice status change if the user has a webhook URL configured.
   */
  async enqueueWebhook(
    invoiceId: string,
    status: string,
    txHash: string | null,
    merchantId?: string,
  ): Promise<void> {
    const where = merchantId
      ? { id: invoiceId, merchantId }
      : { id: invoiceId };
    const invoice = await this.prisma.invoice.findFirst({
      where,
      include: { user: true },
    });

    if (!invoice || !invoice.user || !invoice.user.webhookUrl) {
      if (!invoice?.user?.webhookUrl) {
        this.logger.debug(
          `Skipping webhook for invoice ${invoiceId}: No webhook URL configured for user.`,
        );
      }
      return;
    }

    const payload = {
      invoiceId: invoice.id,
      status,
      txHash,
      timestamp: new Date().toISOString(),
    };

    await this.prisma.webhookDelivery.create({
      data: {
        invoiceId: invoice.id,
        userId: invoice.userId!,
        url: invoice.user.webhookUrl,
        payload: payload,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(), // try immediately or at the next cron tick
      },
    });

    this.logger.log(
      `Webhook enqueued for invoice ${invoiceId} and status ${status}.`,
    );
  }

  /**
   * Process the webhook queue periodically.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      const pendingDeliveries = await this.prisma.webhookDelivery.findMany({
        where: {
          status: "pending",
          nextAttemptAt: { lte: new Date() },
        },
        take: 50,
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });

      if (pendingDeliveries.length > 0) {
        this.logger.log(
          `Processing ${pendingDeliveries.length} pending webhook deliveries...`,
        );
      }

      for (const delivery of pendingDeliveries) {
        await this.deliver(delivery);
      }
    } catch (error) {
      this.logger.error("Error processing webhook queue", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Delivers a single webhook payload, handling retries and HMAC signatures.
   */
  public async deliver(delivery: any): Promise<void> {
    // Re-read the current secret from the database so secret rotation takes
    // effect immediately, even if this delivery was loaded before rotation.
    const user = await this.prisma.user.findUnique({
      where: { id: delivery.userId ?? delivery.user?.id },
      select: { webhookSecret: true },
    });
    const secret = user?.webhookSecret;
    const payloadStr = JSON.stringify(delivery.payload);

    let signature = "";
    if (secret) {
      signature = crypto
        .createHmac("sha256", secret)
        .update(payloadStr)
        .digest("hex");
    }

    // Adding idempotency key based on delivery ID and attempts
    const idempotencyKey = `${delivery.id}-${delivery.attempts}`;

    try {
      await axios.post(delivery.url, delivery.payload, {
        headers: {
          "Content-Type": "application/json",
          "x-invoisio-signature": signature,
          "x-idempotency-key": idempotencyKey,
        },
        timeout: 5000,
      });

      // Update on success
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "success",
          lastAttemptAt: new Date(),
          attempts: delivery.attempts + 1,
        },
      });

      this.logger.log(`Webhook delivery ${delivery.id} succeeded.`);
    } catch (error: any) {
      const attempts = delivery.attempts + 1;
      this.logger.warn(
        `Webhook delivery ${delivery.id} failed (attempt ${attempts}): ${error.message}`,
      );

      if (attempts >= 5) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "failed",
            lastAttemptAt: new Date(),
            attempts,
          },
        });
        this.logger.error(
          `Webhook delivery ${delivery.id} permanently failed after 5 attempts.`,
        );
      } else {
        // Exponential backoff: Math.pow(2, attempts) minutes
        // E.g., attempts: 1 -> 2m, 2 -> 4m, 3 -> 8m, 4 -> 16m
        const nextAttempt = new Date();
        nextAttempt.setMinutes(
          nextAttempt.getMinutes() + Math.pow(2, attempts),
        );

        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastAttemptAt: new Date(),
            nextAttemptAt: nextAttempt,
          },
        });
      }
    }
  }

  private toSecretMetadata(secret: string | null): WebhookSecretMetadata {
    if (!secret) {
      return {
        hasSecret: false,
        maskedSecret: null,
        secretLength: null,
      };
    }

    return {
      hasSecret: true,
      maskedSecret: this.maskSecret(secret),
      secretLength: secret.length,
    };
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 4) {
      return "*".repeat(secret.length);
    }

    if (secret.length <= 8) {
      return `${secret.slice(0, 1)}...${secret.slice(-1)}`;
    }

    return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
  }
}
