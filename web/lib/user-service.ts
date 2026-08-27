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

  /** Load the authenticated user's notification preferences. */
  async getNotificationPreferences(): Promise<UpdateNotificationPreferences> {
    try {
      const response = await apiClient.get<UpdateNotificationPreferences>(
        '/users/preferences',
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
