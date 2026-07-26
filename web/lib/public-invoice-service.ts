import { apiClient } from './api-client';

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
  dueDate?: string;
  createdAt: string;
}

export const PublicInvoiceService = {
  async getInvoice(id: string): Promise<PublicInvoice> {
    const response = await apiClient.get<PublicInvoice>(`/invoices/public/${id}`);
    return response.data;
  },
};
