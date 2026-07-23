import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

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

export interface MerchantActivationChecklist {
  id: string;
  merchantId: string;
  profileCompleted: boolean;
  payoutKeyCompleted: boolean;
  assetPreferenceCompleted: boolean;
  firstInvoiceCompleted: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistStepPatch {
  profileCompleted?: boolean;
  payoutKeyCompleted?: boolean;
  assetPreferenceCompleted?: boolean;
  firstInvoiceCompleted?: boolean;
}

export interface UpdateMerchantSettings {
  name?: string;
  payoutPublicKey?: string;
  preferredAsset?: string;
  webhookUrl?: string;
}

export const MerchantService = {
  async getProfile(): Promise<MerchantProfile> {
    try {
      const response = await apiClient.get<MerchantProfile>('/merchants/profile');
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async updateSettings(dto: UpdateMerchantSettings): Promise<MerchantProfile> {
    try {
      const response = await apiClient.patch<MerchantProfile>(
        '/merchants/settings',
        dto,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async getChecklist(): Promise<MerchantActivationChecklist> {
    try {
      const response = await apiClient.get<MerchantActivationChecklist>(
        '/merchants/checklist',
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async updateChecklist(
    dto: ChecklistStepPatch,
  ): Promise<MerchantActivationChecklist> {
    try {
      const response = await apiClient.patch<MerchantActivationChecklist>(
        '/merchants/checklist',
        dto,
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },

  async syncChecklist(): Promise<MerchantActivationChecklist> {
    try {
      const response = await apiClient.patch<MerchantActivationChecklist>(
        '/merchants/checklist/sync',
        {},
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
