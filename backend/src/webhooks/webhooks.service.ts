import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import * as crypto from "crypto";
import { DeadLetterStatus, Prisma } from "@prisma/client";

export interface WebhookSecretMetadata {
  hasSecret: boolean;
  maskedSecret: string | null;
  secretLength: number | null;
}

export interface WebhookSecretRotationResult {
  secret: string;
  metadata: WebhookSecretMetadata;
}

export interface DeadLetterListQuery {
  status?: DeadLetterStatus;
  limit?: number;
}

export interface InvoiceWebhookAttemptsQuery {
  limit?: number;
}

const MAX_DELIVERY_ATTEMPTS = 5;
const DEFAULT_DEAD_LETTER_LIMIT = 50;
const MAX_DEAD_LETTER_LIMIT = 100;
const DEFAULT_ATTEMPT_LIMIT = 50;
const MAX_ATTEMPT_LIMIT = 100;

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
      select: { webhookSecret: true, merchantId: true },
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
    const signatureMetadata = this.toSignatureMetadata(signature);
    const attemptNumber = delivery.attempts + 1;

    // Adding idempotency key based on delivery ID and attempts
    const idempotencyKey = `${delivery.id}-${delivery.attempts}`;

    try {
      const response = await axios.post(delivery.url, delivery.payload, {
        headers: {
          "Content-Type": "application/json",
          "x-invoisio-signature": signature,
          "x-idempotency-key": idempotencyKey,
        },
        timeout: 5000,
      });

      await this.prisma.webhookAttempt.create({
        data: {
          deliveryId: delivery.id,
          invoiceId: delivery.invoiceId,
          userId: delivery.userId,
          requestUrl: delivery.url,
          requestPayload: this.toPrismaJsonValue(delivery.payload),
          attemptNumber,
          responseStatusCode: response.status,
          errorMessage: null,
          status: "success",
          signaturePresent: signatureMetadata.signaturePresent,
          signatureAlgorithm: signatureMetadata.signatureAlgorithm,
          signaturePreview: signatureMetadata.signaturePreview,
          signatureLength: signatureMetadata.signatureLength,
        },
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

      if (delivery.deadLetterId) {
        await this.prisma.webhookDeadLetter.update({
          where: { id: delivery.deadLetterId },
          data: {
            status: "recovered",
            recoveredAt: new Date(),
          },
        });
      }

      this.logger.log(`Webhook delivery ${delivery.id} succeeded.`);
    } catch (error: any) {
      const attempts = attemptNumber;
      const failure = this.toFailureDetails(error);

      await this.prisma.webhookAttempt.create({
        data: {
          deliveryId: delivery.id,
          invoiceId: delivery.invoiceId,
          userId: delivery.userId,
          requestUrl: delivery.url,
          requestPayload: this.toPrismaJsonValue(delivery.payload),
          attemptNumber,
          responseStatusCode: failure.httpStatus,
          errorMessage: failure.message,
          status: "failed",
          signaturePresent: signatureMetadata.signaturePresent,
          signatureAlgorithm: signatureMetadata.signatureAlgorithm,
          signaturePreview: signatureMetadata.signaturePreview,
          signatureLength: signatureMetadata.signatureLength,
        },
      });

      this.logger.warn(
        `Webhook delivery ${delivery.id} failed (attempt ${attempts}): ${failure.message}`,
      );

      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        await this.moveToDeadLetter(
          {
            ...delivery,
            merchantId: user?.merchantId,
          },
          attempts,
          failure,
        );
        this.logger.error(
          `Webhook delivery ${delivery.id} moved to dead-letter queue after ${MAX_DELIVERY_ATTEMPTS} attempts.`,
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

  async listDeadLetters(query: DeadLetterListQuery = {}) {
    const take = this.normalizeDeadLetterLimit(query.limit);

    return this.prisma.webhookDeadLetter.findMany({
      where: query.status ? { status: query.status } : undefined,
      take,
      orderBy: [{ exhaustedAt: "desc" }, { createdAt: "desc" }],
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            merchantId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            publicKey: true,
          },
        },
      },
    });
  }

  async listInvoiceWebhookAttempts(
    invoiceId: string,
    merchantId: string,
    query: InvoiceWebhookAttemptsQuery = {},
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      select: { id: true },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    const take = this.normalizeAttemptLimit(query.limit);

    return this.prisma.webhookAttempt.findMany({
      where: { invoiceId },
      take,
      orderBy: [{ createdAt: "desc" }, { attemptNumber: "desc" }],
      select: {
        id: true,
        deliveryId: true,
        requestUrl: true,
        requestPayload: true,
        attemptNumber: true,
        responseStatusCode: true,
        errorMessage: true,
        status: true,
        signaturePresent: true,
        signatureAlgorithm: true,
        signaturePreview: true,
        signatureLength: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getDeadLetter(deadLetterId: string) {
    const deadLetter = await this.prisma.webhookDeadLetter.findUnique({
      where: { id: deadLetterId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            merchantId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            publicKey: true,
          },
        },
        redriveDeliveries: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            attempts: true,
            lastAttemptAt: true,
            nextAttemptAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!deadLetter) {
      throw new NotFoundException("Dead-letter webhook not found.");
    }

    return deadLetter;
  }

  async retryDeadLetter(deadLetterId: string) {
    const deadLetter = await this.prisma.webhookDeadLetter.findUnique({
      where: { id: deadLetterId },
    });

    if (!deadLetter) {
      throw new NotFoundException("Dead-letter webhook not found.");
    }

    if (deadLetter.status === "recovered") {
      throw new BadRequestException(
        "Dead-letter webhook has already been recovered.",
      );
    }

    const existingPendingRetry = await this.prisma.webhookDelivery.findFirst({
      where: {
        deadLetterId,
        status: "pending",
      },
      select: { id: true },
    });

    if (existingPendingRetry) {
      throw new BadRequestException(
        "Dead-letter webhook is already queued for retry.",
      );
    }

    const queuedAt = new Date();
    const delivery = await this.prisma.$transaction(
      async (tx) => {
        const txClient = tx as any;
        const createdDelivery = await txClient.webhookDelivery.create({
          data: {
            invoiceId: deadLetter.invoiceId,
            userId: deadLetter.userId,
            deadLetterId: deadLetter.id,
            url: deadLetter.url,
            payload: this.toPrismaJsonValue(deadLetter.payload),
            status: "pending",
            attempts: 0,
            nextAttemptAt: queuedAt,
          },
        });

        await txClient.webhookDeadLetter.update({
          where: { id: deadLetterId },
          data: {
            status: "requeued",
            manualRetryCount: { increment: 1 },
            lastRetriedAt: queuedAt,
            recoveredAt: null,
          },
        });

        return createdDelivery;
      },
    );

    return {
      deadLetterId: deadLetter.id,
      deliveryId: delivery.id,
      status: "requeued" as DeadLetterStatus,
    };
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

  private normalizeDeadLetterLimit(limit?: number): number {
    if (!limit) {
      return DEFAULT_DEAD_LETTER_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_DEAD_LETTER_LIMIT);
  }

  private normalizeAttemptLimit(limit?: number): number {
    if (!limit) {
      return DEFAULT_ATTEMPT_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_ATTEMPT_LIMIT);
  }

  private toFailureDetails(error: any): {
    message: string;
    httpStatus: number | null;
  } {
    const httpStatus = error?.response?.status ?? null;
    const responseData = error?.response?.data;

    if (typeof responseData === "string" && responseData.trim().length > 0) {
      return {
        message: responseData.slice(0, 500),
        httpStatus,
      };
    }

    if (responseData && typeof responseData === "object") {
      try {
        return {
          message: JSON.stringify(responseData).slice(0, 500),
          httpStatus,
        };
      } catch {
        // fall back to the generic message below
      }
    }

    return {
      message: error?.message ?? "Unknown webhook delivery error",
      httpStatus,
    };
  }

  private toSignatureMetadata(signature: string): {
    signaturePresent: boolean;
    signatureAlgorithm: string | null;
    signaturePreview: string | null;
    signatureLength: number | null;
  } {
    if (!signature) {
      return {
        signaturePresent: false,
        signatureAlgorithm: null,
        signaturePreview: null,
        signatureLength: null,
      };
    }

    return {
      signaturePresent: true,
      signatureAlgorithm: "hmac-sha256",
      signaturePreview: this.maskSignature(signature),
      signatureLength: signature.length,
    };
  }

  private maskSignature(signature: string): string {
    if (signature.length <= 8) {
      return "*".repeat(signature.length);
    }

    if (signature.length <= 12) {
      return `${signature.slice(0, 2)}...${signature.slice(-2)}`;
    }

    return `${signature.slice(0, 6)}...${signature.slice(-6)}`;
  }

  private async moveToDeadLetter(
    delivery: {
      id: string;
      invoiceId: string;
      userId: string;
      merchantId?: string | null;
      deadLetterId?: string | null;
      url: string;
      payload: unknown;
    },
    attempts: number,
    failure: { message: string; httpStatus: number | null },
  ): Promise<void> {
    const merchantId = delivery.merchantId;

    if (!merchantId) {
      throw new NotFoundException(
        `Merchant not found for failed webhook delivery ${delivery.id}.`,
      );
    }

    const exhaustedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const txClient = tx as any;
      if (delivery.deadLetterId) {
        await txClient.webhookDeadLetter.update({
          where: { id: delivery.deadLetterId },
          data: {
            url: delivery.url,
            payload: this.toPrismaJsonValue(delivery.payload),
            lastError: failure.message,
            lastHttpStatus: failure.httpStatus,
            failedAttempts: attempts,
            exhaustedAt,
            status: "pending_retry",
            recoveredAt: null,
          },
        });
      } else {
        await txClient.webhookDeadLetter.create({
          data: {
            originalDeliveryId: delivery.id,
            invoiceId: delivery.invoiceId,
            userId: delivery.userId,
            merchantId,
            url: delivery.url,
            payload: this.toPrismaJsonValue(delivery.payload),
            lastError: failure.message,
            lastHttpStatus: failure.httpStatus,
            failedAttempts: attempts,
            exhaustedAt,
            status: "pending_retry",
          },
        });
      }

      await txClient.webhookDelivery.delete({
        where: { id: delivery.id },
      });
    });
  }

  private toPrismaJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
