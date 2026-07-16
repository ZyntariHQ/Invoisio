import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

/* ── Types ─────────────────────────────────────────────────── */

export interface MerchantProfile {
  id: string;
  name: string;
  stellarPublicKey: string;
  payoutPublicKey: string | null;
  preferredAsset: string;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  pushNotificationsEnabled: boolean;
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
}

export interface UpdateMerchantSettingsPayload {
  name?: string;
  payoutPublicKey?: string;
  preferredAsset?: string;
  webhookUrl?: string;
}

export const PREFERRED_ASSETS = ['USDC', 'EURC', 'XLM', 'USD'] as const;
export type PreferredAsset = (typeof PREFERRED_ASSETS)[number];

/* ── Service ───────────────────────────────────────────────── */

export const SettingsService = {
  /** GET /merchants/profile — fetch merchant profile & settings */
  async getMerchantProfile(): Promise<MerchantProfile> {
    try {
      const response = await apiClient.get<MerchantProfile>('/merchants/profile');
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /** PATCH /merchants/settings — update merchant-level settings */
  async updateMerchantSettings(
    payload: UpdateMerchantSettingsPayload,
  ): Promise<MerchantProfile> {
    try {
      const response = await apiClient.patch<MerchantProfile>(
        '/merchants/settings',
        payload,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /** GET /users/preferences — fetch user notification preferences */
  async getUserPreferences(): Promise<UserPreferences> {
    try {
      const response = await apiClient.get<UserPreferences>('/users/preferences');
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  /** PATCH /users/preferences — toggle push notifications */
  async updatePushNotifications(enabled: boolean): Promise<{ success: boolean }> {
    try {
      const response = await apiClient.patch<{ success: boolean }>(
        '/users/preferences',
        { pushNotificationsEnabled: enabled },
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
