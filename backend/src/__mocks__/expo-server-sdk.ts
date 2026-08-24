export class Expo {
  chunkPushNotifications(messages: unknown[]): unknown[][] {
    if (messages.length === 0) return [];
    return [messages];
  }

  chunkPushNotificationReceiptIds(ids: unknown[]): unknown[][] {
    if (ids.length === 0) return [];
    return [ids];
  }

  async sendPushNotificationsAsync(): Promise<unknown[]> {
    return [];
  }

  async getPushNotificationReceiptsAsync(): Promise<Record<string, unknown>> {
    return {};
  }

  static isExpoPushToken(): boolean {
    return true;
  }
}
export type ExpoPushMessage = Record<string, unknown>;
