import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from "expo-server-sdk";
import {
  Invoice,
  Payment,
  PaymentReview,
  Prisma,
  PushNotificationFailureReason,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPayload } from "./types/notification-payload.type";

const PERMANENT_FAILURE_REASONS = new Set<PushNotificationFailureReason>([
  "DeviceNotRegistered",
  "DeviceNotRegisteredOnPlatform",
  "InvalidCredentials",
  "MessageTooBig",
]);

interface MessageWithMetadata {
  message: ExpoPushMessage;
  userId: string;
  merchantId: string;
  pushToken: string;
  eventType: string;
  title: string;
  body: string;
  data: NotificationPayload;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo: Expo;
  private isProcessingReceipts = false;

  constructor(private readonly prisma: PrismaService) {
    this.expo = new Expo();
  }

  async notifyInvoicePaid(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Invoice Paid: ${invoice.invoiceNumber}`,
      `Invoice ${invoice.invoiceNumber} for ${invoice.amount.toString()} ${invoice.assetCode} has been paid.`,
      {
        type: "invoice.paid",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        deepLink: `invoisio://receipt/${invoice.id}`,
      },
    );
  }

  async notifyInvoiceOverdue(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Invoice Overdue: ${invoice.invoiceNumber}`,
      `Invoice ${invoice.invoiceNumber} is now overdue. Please follow up with ${invoice.clientName}.`,
      {
        type: "invoice.overdue",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        deepLink: `invoisio://invoice/${invoice.id}`,
      },
    );
  }

  async notifyInvoiceReminder(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Reminder: Invoice ${invoice.invoiceNumber}`,
      `This is a reminder that invoice ${invoice.invoiceNumber} for ${invoice.clientName} is still unpaid.`,
      {
        type: "invoice.reminder",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        deepLink: `invoisio://invoice/${invoice.id}`,
      },
    );
  }

  async notifyPaymentReceived(payment: Payment, merchantId: string) {
    await this.sendNotificationToMerchant(
      merchantId,
      "Payment Received",
      `A payment of ${payment.amount.toString()} has been received.`,
      {
        type: "payment.received",
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        deepLink: `invoisio://receipt/${payment.invoiceId}`,
      },
    );
  }

  async notifyPaymentReviewFlagged(review: PaymentReview) {
    if (!review.merchantId) {
      this.logger.warn(
        `PaymentReview ${review.id} has no merchantId; skipping notification`,
      );
      return;
    }

    await this.sendNotificationToMerchant(
      review.merchantId,
      "Payment Needs Review",
      `A payment (${review.issueType}) requires your review.`,
      {
        type: "payment.review_flagged",
        reviewId: review.id,
        invoiceId: review.invoiceId,
        deepLink: `invoisio://review/${review.id}`,
      },
    );
  }

  private async sendNotificationToMerchant(
    merchantId: string,
    title: string,
    body: string,
    data: NotificationPayload,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        merchantId,
        pushNotificationsEnabled: true,
      },
    });

    const messagesWithMeta: MessageWithMetadata[] = [];
    for (const user of users) {
      for (const pushToken of user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
          this.logger.warn(
            `Push token ${String(pushToken)} is not a valid Expo push token`,
          );
          continue;
        }

        messagesWithMeta.push({
          message: {
            to: pushToken,
            sound: "default",
            title,
            body,
            data,
          },
          userId: user.id,
          merchantId: user.merchantId,
          pushToken,
          eventType: data.type,
          title,
          body,
          data,
        });
      }
    }

    if (messagesWithMeta.length === 0) return;

    const createdRecords = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const records: { id: string; index: number }[] = [];
      for (let i = 0; i < messagesWithMeta.length; i++) {
        const meta = messagesWithMeta[i];
        const record = await tx.pushNotification.create({
          data: {
            userId: meta.userId,
            merchantId: meta.merchantId,
            pushToken: meta.pushToken,
            eventType: meta.eventType,
            title: meta.title,
            body: meta.body,
            payload: this.toPrismaJsonValue(meta.data),
            status: "queued",
          },
          select: { id: true },
        });
        records.push({ id: record.id, index: i });
      }
      return records;
    });

    const recordIndexToId = new Map<number, string>();
    for (const r of createdRecords) {
      recordIndexToId.set(r.index, r.id);
    }

    const messages = messagesWithMeta.map((m) => m.message);
    const chunks = this.expo.chunkPushNotifications(messages);
    let globalMessageIndex = 0;

    for (const chunk of chunks) {
      try {
        const ticketChunk: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
        this.logger.log(
          `Sent push notifications: ${JSON.stringify(ticketChunk)}`,
        );

        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          for (let i = 0; i < ticketChunk.length; i++) {
            const ticket = ticketChunk[i];
            const recordId = recordIndexToId.get(globalMessageIndex + i);
            if (!recordId) continue;

            if (ticket.status === "ok") {
              await tx.pushNotification.update({
                where: { id: recordId },
                data: {
                  status: "ticket_ok",
                  expoTicketId: ticket.id,
                  ticketCreatedAt: new Date(),
                },
              });
            } else {
              const failureReason = this.toPushNotificationFailureReason(
                ticket.details?.error,
              );
              await tx.pushNotification.update({
                where: { id: recordId },
                data: {
                  status: "ticket_error",
                  ticketError: ticket.message ?? null,
                  ticketErrorDetails: this.toPrismaJsonValue(ticket.details ?? null),
                  receiptFailureReason: failureReason,
                },
              });

              const meta = messagesWithMeta[globalMessageIndex + i];
              if (meta && this.isPermanentFailure(failureReason)) {
                await this.removeBadToken(
                  tx,
                  meta.userId,
                  meta.pushToken,
                  recordId,
                  `Ticket error: ${ticket.details?.error ?? ticket.message ?? "Unknown"}`,
                );
              }
            }
          }
        });
      } catch (error) {
        this.logger.error("Error sending push notifications", error);
        await this.prisma.pushNotification.updateMany({
          where: {
            id: {
              in: Array.from({ length: chunk.length }, (_, i) =>
                recordIndexToId.get(globalMessageIndex + i),
              ).filter((id): id is string => typeof id === "string"),
            },
          },
          data: {
            status: "ticket_error",
            ticketError: error instanceof Error ? error.message : String(error),
          },
        });
      }
      globalMessageIndex += chunk.length;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processReceipts() {
    if (this.isProcessingReceipts) {
      return;
    }

    this.isProcessingReceipts = true;
    try {
      const pendingReceipts = await this.prisma.pushNotification.findMany({
        where: {
          status: { in: ["ticket_ok", "receipt_error_retryable"] },
          expoTicketId: { not: null },
        },
        take: 300,
        orderBy: { createdAt: "asc" },
      });

      if (pendingReceipts.length === 0) {
        return;
      }

      this.logger.log(
        `Fetching delivery receipts for ${pendingReceipts.length} push notifications...`,
      );

      const ticketIdToRecord = new Map<string, typeof pendingReceipts[number]>();
      const ticketIds: string[] = [];
      for (const record of pendingReceipts) {
        if (record.expoTicketId) {
          ticketIdToRecord.set(record.expoTicketId, record);
          ticketIds.push(record.expoTicketId);
        }
      }

      const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(ticketIds);
      for (const chunk of receiptIdChunks) {
        try {
          const receipts: Record<string, ExpoPushReceipt> =
            await this.expo.getPushNotificationReceiptsAsync(chunk);

          await this.processReceiptChunk(receipts, ticketIdToRecord);
        } catch (error) {
          this.logger.error("Error fetching push notification receipts", error);
        }
      }
    } catch (error) {
      this.logger.error("Error processing push notification receipts", error);
    } finally {
      this.isProcessingReceipts = false;
    }
  }

  private async processReceiptChunk(
    receipts: Record<string, ExpoPushReceipt>,
    ticketIdToRecord: Map<string, { id: string; userId: string; pushToken: string; merchantId: string }>,
  ) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const [ticketId, receipt] of Object.entries(receipts)) {
        const record = ticketIdToRecord.get(ticketId);
        if (!record) continue;

        const receiptDetails = this.toPrismaJsonValue({
          ...receipt,
        });

        if (receipt.status === "ok") {
          await tx.pushNotification.update({
            where: { id: record.id },
            data: {
              status: "receipt_ok",
              receiptStatus: receipt.status,
              receiptFetchedAt: new Date(),
              receiptDetails,
            },
          });
        } else {
          const failureReason = this.toPushNotificationFailureReason(
            receipt.details?.error,
          );
          const isPermanent = this.isPermanentFailure(failureReason);

          await tx.pushNotification.update({
            where: { id: record.id },
            data: {
              status: isPermanent ? "receipt_error_permanent" : "receipt_error_retryable",
              receiptStatus: receipt.status,
              receiptMessage: receipt.message ?? null,
              receiptFailureReason: failureReason,
              receiptFetchedAt: new Date(),
              receiptDetails,
            },
          });

          if (isPermanent) {
            await this.removeBadToken(
              tx,
              record.userId,
              record.pushToken,
              record.id,
              `Receipt error: ${receipt.details?.error ?? receipt.message ?? "Unknown"}`,
            );
          }
        }
      }
    });
  }

  private async removeBadToken(
    tx: Prisma.TransactionClient,
    userId: string,
    pushToken: string,
    notificationRecordId: string,
    note: string,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { pushTokens: true },
    });

    if (!user) {
      this.logger.warn(
        `Cannot remove push token: user ${userId} not found`,
      );
      return;
    }

    const updatedTokens = user.pushTokens.filter((t: string) => t !== pushToken);
    const wasRemoved = updatedTokens.length !== user.pushTokens.length;

    if (!wasRemoved) {
      this.logger.debug(
        `Push token ${pushToken} was no longer present on user ${userId}`,
      );
      return;
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        pushTokens: updatedTokens,
      },
    });

    const removedAt = new Date();
    await tx.pushNotification.update({
      where: { id: notificationRecordId },
      data: {
        status: "token_removed",
        removedTokenAt: removedAt,
        removedTokenNote: note,
      },
    });

    this.logger.warn(
      `Removed invalid push token from user ${userId}: ${note}`,
    );
  }

  private toPushNotificationFailureReason(
    expoError: string | undefined | null,
  ): PushNotificationFailureReason | null {
    if (!expoError) return null;

    switch (expoError) {
      case "DeviceNotRegistered":
        return "DeviceNotRegistered";
      case "InvalidCredentials":
        return "InvalidCredentials";
      case "MessageTooBig":
        return "MessageTooBig";
      case "MessageRateExceeded":
        return "MessageRateExceeded";
      case "ProviderError":
        return "ProviderError";
      case "InvalidProviderError":
        return "InvalidProviderError";
      case "DeviceNotRegisteredOnPlatform":
        return "DeviceNotRegisteredOnPlatform";
      default:
        return "Unknown";
    }
  }

  private isPermanentFailure(
    reason: PushNotificationFailureReason | null,
  ): boolean {
    if (!reason) return false;
    return PERMANENT_FAILURE_REASONS.has(reason);
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
