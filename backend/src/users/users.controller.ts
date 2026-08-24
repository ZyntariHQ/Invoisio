import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PushTokenDto } from "./dto/push-token.dto";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";

@ApiTags("users")
@Controller("users")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("push-token")
  async addPushToken(@Req() req, @Body() dto: PushTokenDto) {
    return this.usersService.addPushToken(req.user.id, dto.token);
  }

  @Delete("push-token")
  async removePushToken(@Req() req, @Body() dto: PushTokenDto) {
    return this.usersService.removePushToken(req.user.id, dto.token);
  }

  @Patch("preferences")
  async updatePreferences(@Req() req, @Body() dto: UpdatePreferencesDto) {
    if (dto.pushNotificationsEnabled === undefined) {
      return { success: true };
    }
    return this.usersService.updatePreferences(
      req.user.id,
      dto.pushNotificationsEnabled,
    );
  }

  @Get("preferences")
  async getPreferences(@Req() req) {
    return this.usersService.getPreferences(req.user.id);
  }
}
