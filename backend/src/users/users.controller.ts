import { Body, Controller, Delete, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('push-token')
  async addPushToken(@Req() req, @Body('token') token: string) {
    return this.usersService.addPushToken(req.user.id, token);
  }

  @Delete('push-token')
  async removePushToken(@Req() req, @Body('token') token: string) {
    return this.usersService.removePushToken(req.user.id, token);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req,
    @Body('pushNotificationsEnabled') pushNotificationsEnabled: boolean,
  ) {
    return this.usersService.updatePreferences(req.user.id, pushNotificationsEnabled);
  }
}
