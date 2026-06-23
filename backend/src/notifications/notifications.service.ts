import { Inject, Injectable, Logger } from "@nestjs/common";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { Invoice } from "@prisma/client";
import { MAIL_PROVIDER } from "./mail-provider.interface";
import type { MailProvider } from "./mail-provider.interface";
import { buildPaymentRequestEmail } from "./payment-request-email.template";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo: Expo;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(MAIL_PROVIDER)
    private readonly mailProvider: MailProvider,
  ) {
    this.expo = new Expo();
  }

  async sendPaymentRequestEmail(invoice: Invoice): Promise<void> {
    if (!invoice.clientEmail) {
      this.logger.warn(
        `Skipping payment request email for invoice ${invoice.id}: missing client email`,
      );
      return;
    }

    const appBaseUrl =
      this.configService.get<string>("APP_BASE_URL") ||
      this.configService.get<string>("CORS_ORIGIN") ||
      "http://localhost:3000";

    const email = buildPaymentRequestEmail(invoice, appBaseUrl);
    const result = await this.mailProvider.send({
      to: invoice.clientEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    this.logger.log(
      `Payment request email result for invoice ${invoice.id}: ${JSON.stringify(result)}`,
    );
  }

  async notifyInvoicePaid(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Invoice Paid: ${invoice.invoiceNumber}`,
      `Invoice ${invoice.invoiceNumber} for ${invoice.amount.toString()} ${invoice.assetCode} has been paid.`,
    );
  }

  async notifyInvoiceOverdue(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Invoice Overdue: ${invoice.invoiceNumber}`,
      `Invoice ${invoice.invoiceNumber} is now overdue. Please follow up with ${invoice.clientName}.`,
    );
  }

  private async sendNotificationToMerchant(
    merchantId: string,
    title: string,
    body: string,
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
          data: { withSome: "data" },
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
