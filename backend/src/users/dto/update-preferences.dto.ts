import { IsBoolean, IsOptional } from "class-validator";

/**
 * DTO for updating user notification preferences.
 *
 * All fields are optional so clients can send partial updates
 * (e.g. only the fields they want to change).
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushNotificationsEnabled?: boolean;
}
