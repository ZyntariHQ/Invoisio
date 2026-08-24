import { IsNotEmpty, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";

/**
 * Validates and normalizes an Expo push token.
 *
 * Expo push tokens follow one of these formats:
 *  - ExponentPushToken[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
 *  - ExpoPushToken[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
 *
 * The regex also accepts opaque token strings that some Expo SDK versions
 * emit, as long as they are non-empty and wrapped in brackets.
 */
const EXPO_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[.+\]$/;

export class PushTokenDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(EXPO_TOKEN_PATTERN, {
    message: "token must be a valid Expo push token",
  })
  token: string;
}
