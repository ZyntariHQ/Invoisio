import { apiClient } from './api-client';
import { API_URL } from './api-client';

export interface PublicInvoice {
  id: string;
  invoiceNumber?: string;
  merchantName: string;
  description?: string;
  amount: number;
  asset_code: string;
  asset_issuer?: string;
  memo: string;
  destination_address: string;
  status: string;
  tx_hash?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export const PublicInvoiceService = {
  async getInvoice(id: string): Promise<PublicInvoice> {
    const response = await apiClient.get<PublicInvoice>(`/invoices/public/${id}`);
    return response.data;
  },

  async getInvoiceForPage(id: string): Promise<PublicInvoice | null> {
    if (!id) return null;

    try {
      const response = await fetch(
        `${API_URL}/invoices/public/${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) return null;
      return (await response.json()) as PublicInvoice;
    } catch {
      return null;
    }
  },
};
