import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page: number = 1, limit: number = 10, unread?: boolean) {
    const where: any = { userId };
    if (typeof unread !== 'undefined') {
      where.read = unread ? false : undefined;
    }

    const prismaAny = this.prisma as any;
    const [items, total] = await Promise.all([
      prismaAny.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prismaAny.notification.count({ where }),
    ]);

    return {
      notifications: items.map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt?.toISOString?.() ?? n.createdAt,
        metadata: n.metadata ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async markRead(userId: string, id: string) {
    const prismaAny = this.prisma as any;
    const exists = await prismaAny.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException('Notification not found');
    }
    const updated = await prismaAny.notification.update({
      where: { id },
      data: { read: true },
    });
    return { id: updated.id, read: updated.read };
  }

  async unreadCount(userId: string) {
    const prismaAny = this.prisma as any;
    const count = await prismaAny.notification.count({ where: { userId, read: false } });
    return { count };
  }
}