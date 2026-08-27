import { ApiProperty } from "@nestjs/swagger";

export class NotificationPreferencesDto {
  @ApiProperty({
    description:
      "Whether the authenticated user has opted in to receiving push notifications.",
    example: true,
  })
  pushNotificationsEnabled: boolean;

  @ApiProperty({
    description:
      "Number of Expo push tokens currently registered for this user on any device. " +
      "Zero means no device has registered a token yet; notifications will be skipped.",
    example: 2,
  })
  registeredPushTokensCount: number;

  @ApiProperty({
    description:
      "True when the backend was able to read an explicit saved preference. " +
      "False when the user record was missing/legacy and this response falls " +
      "back to the documented schema default. Consumers can use this flag to " +
      "tell whether a first-run settings dialog should be shown.",
    example: true,
  })
  preferenceExplicit: boolean;

  @ApiProperty({
    description:
      "Semantic contract version for this response shape. Clients may key " +
      "parsing logic on this string.",
    example: "1.0.0",
  })
  contractVersion: "1.0.0";
}
