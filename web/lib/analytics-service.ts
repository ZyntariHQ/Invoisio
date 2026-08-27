import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

export interface AnalyticsMetric {
  count: number;
  totalAmount: number;
}

export interface MerchantAnalyticsOverview {
  paid: AnalyticsMetric;
  overdue: AnalyticsMetric;
  draft: AnalyticsMetric;
  outstanding: AnalyticsMetric;
}

export const AnalyticsService = {
  async getOverview(): Promise<MerchantAnalyticsOverview> {
    try {
      const response = await apiClient.get<MerchantAnalyticsOverview>(
        '/merchant/analytics/overview',
      );
      return response.data;
    } catch (error) {
      throw new Error(extractApiErrorMessage(error));
    }
  },
};
