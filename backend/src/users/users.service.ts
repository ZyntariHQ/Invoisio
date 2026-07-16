import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async addPushToken(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    if (!user.pushTokens.includes(token)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          pushTokens: {
            push: token,
          },
        },
      });
    }
    return { success: true };
  }

  async removePushToken(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const newTokens = user.pushTokens.filter((t) => t !== token);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pushTokens: {
          set: newTokens,
        },
      },
    });
    return { success: true };
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushNotificationsEnabled: true,
        webhookUrl: true,
        webhookSecret: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");

    return {
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      webhookUrl: user.webhookUrl,
      hasWebhookSecret: !!user.webhookSecret,
    };
  }

  async updatePreferences(userId: string, pushNotificationsEnabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushNotificationsEnabled },
    });
    return { success: true };
  }
}
