import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferencesDto } from "./dto/notification-preferences.dto";

@ApiTags("notifications")
@Controller("notifications")
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("preferences")
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Read the authenticated user's notification preferences",
    description:
      "Returns a stable, typed contract for the current user's push-notification " +
      "state, including whether push is enabled, how many Expo tokens are " +
      "registered, whether an explicit preference was saved on the user row, " +
      "and a semantic contractVersion clients can key on for parsing. Safe for " +
      "settings prefetch and session bootstrap: missing or legacy user rows " +
      "return a documented default instead of 404.",
  })
  @ApiOkResponse({
    description:
      "Authenticated user's notification preference state. Always returns a " +
      "contract (v1.0.0), even for missing or legacy records.",
    type: NotificationPreferencesDto,
  })
  async getPreferences(
    @CurrentUser() user: User,
  ): Promise<NotificationPreferencesDto> {
    return this.notificationsService.getNotificationPreferences(
      user.id,
      user.merchantId,
    );
  }
}
