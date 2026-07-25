import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

export interface UpdateNotificationPreferences {
  pushNotificationsEnabled: boolean;
}

export interface UpdatePreferencesResponse {
  success: boolean;
}

export const UserService = {
  /**
   * Update the authenticated user's notification preferences.
   * Backed by PATCH /users/preferences.
   */
  async updateNotificationPreferences(
    dto: UpdateNotificationPreferences,
  ): Promise<UpdatePreferencesResponse> {
    try {
      const response = await apiClient.patch<UpdatePreferencesResponse>(
        '/users/preferences',
        dto,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /**
   * TODO(backend): there is currently no endpoint that returns the user's
   * stored `pushNotificationsEnabled` value (GET /auth/me only exposes
   * id/publicKey/createdAt). Once the backend exposes it — e.g. on
   * GET /users/preferences or as an extra field on /auth/me — replace this
   * stub so the settings UI can prefetch the real value instead of assuming
   * the schema default.
   */
  async getNotificationPreferences(): Promise<UpdateNotificationPreferences | null> {
    return null;
  },
};
