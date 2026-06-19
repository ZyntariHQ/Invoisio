export class Expo {
  chunkPushNotifications() {
    return [];
  }
  async sendPushNotificationsAsync() {
    return [];
  }
  static isExpoPushToken() {
    return true;
  }
}
export type ExpoPushMessage = Record<string, unknown>;
