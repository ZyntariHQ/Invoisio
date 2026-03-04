import axios from "axios";
import { useQuery } from "@tanstack/react-query";

// In a real app, this would be an environment variable
// For local development with Expo on web, localhost usually works.
// On physical devices, you'd need your computer's local IP.
const API_URL = "http://localhost:3001";

const api = axios.create({
  baseURL: API_URL,
});

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  asset_code: string;
  asset_issuer?: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  dueDate: string;
  createdAt: string;
}

export interface PaginatedInvoices {
  data: Invoice[];
  meta: {
    totalCount: number;
    totalPending: number;
    totalPaid: number;
    page: number;
    limit: number;
  };
}

export const getInvoices = async (
  page = 1,
  limit = 10,
): Promise<PaginatedInvoices> => {
  const { data } = await api.get<PaginatedInvoices>("/invoices", {
    params: { page, limit },
  });
  return data;
};

export const useInvoices = (page = 1, limit = 10) => {
  return useQuery({
    queryKey: ["invoices", page, limit],
    queryFn: () => getInvoices(page, limit),
  });
};
