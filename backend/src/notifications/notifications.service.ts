import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { Invoice } from '@prisma/client';

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
      `Invoice ${invoice.invoiceNumber} for ${invoice.amount} ${invoice.assetCode} has been paid.`
    );
  }

  async notifyInvoiceOverdue(invoice: Invoice) {
    await this.sendNotificationToMerchant(
      invoice.merchantId,
      `Invoice Overdue: ${invoice.invoiceNumber}`,
      `Invoice ${invoice.invoiceNumber} is now overdue. Please follow up with ${invoice.clientName}.`
    );
  }

  private async sendNotificationToMerchant(merchantId: string, title: string, body: string) {
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
          this.logger.warn(`Push token ${pushToken} is not a valid Expo push token`);
          continue;
        }

        messages.push({
          to: pushToken,
          sound: 'default',
          title,
          body,
          data: { withSome: 'data' },
        });
      }
    }

    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        this.logger.log(`Sent push notifications: ${JSON.stringify(ticketChunk)}`);
      } catch (error) {
        this.logger.error('Error sending push notifications', error);
      }
    }
  }
}
