import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalize a push token by trimming whitespace.
   * The DTO layer already validates the format; this ensures any
   * programmatic callers that bypass the controller still get a
   * cleaned token.
   */
  private normalizeToken(token: string): string {
    return token.trim();
  }

  async addPushToken(userId: string, token: string) {
    const normalizedToken = this.normalizeToken(token);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    if (!user.pushTokens.includes(normalizedToken)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          pushTokens: {
            push: normalizedToken,
          },
        },
      });
    }
    return { success: true };
  }

  async removePushToken(userId: string, token: string) {
    const normalizedToken = this.normalizeToken(token);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const newTokens = user.pushTokens.filter((t) => t !== normalizedToken);
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

  async updatePreferences(userId: string, pushNotificationsEnabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushNotificationsEnabled },
    });
    return { success: true };
  }

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushNotificationsEnabled: true },
    });

    if (!user) throw new NotFoundException("User not found");

    return user;
  }
}
