import { Controller, Get, Post, Param, Query, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query() paginationDto: PaginationDto,
    @Query('unread') unread?: string,
  ) {
    const userId = req.user?.userId;
    const unreadBool = typeof unread === 'string' ? unread === 'true' : undefined;
    return this.notificationsService.list(userId, paginationDto.page, paginationDto.limit, unreadBool);
  }

  @Post(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.notificationsService.markRead(userId, id);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const userId = req.user?.userId;
    return this.notificationsService.unreadCount(userId);
  }
}