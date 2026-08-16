import { Injectable, Logger } from "@nestjs/common";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { PrismaService } from "../prisma/prisma.service";
import { Invoice, Payment, PaymentReview } from "@prisma/client";
import { NotificationPayload } from "./types/notification-payload.type";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo: Expo;

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

    const messages: ExpoPushMessage[] = [];
    for (const user of users) {
      for (const pushToken of user.pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
          this.logger.warn(
            `Push token ${String(pushToken)} is not a valid Expo push token`,
          );
          continue;
        }

        messages.push({
          to: pushToken,
          sound: "default",
          title,
          body,
          data,
        });
      }
    }

    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        this.logger.log(
          `Sent push notifications: ${JSON.stringify(ticketChunk)}`,
        );
      } catch (error) {
        this.logger.error("Error sending push notifications", error);
      }
    }
  }
}
