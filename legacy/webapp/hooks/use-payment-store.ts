import { create } from "zustand";
import { api } from "@/lib/axios";
import { useAuthStore } from "./use-auth-store";

export interface Payment {
  id: string;
  invoiceId: string;
  userId: string;
  merchantAddress?: string;
  token: 'ETH' | 'USDC' | 'USDT';
  amount: string;
  transactionHash?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface InitiatePaymentInput {
  invoiceId: string;
  token: 'ETH' | 'USDC' | 'USDT';
  amount: string;
  merchantAddress?: string;
}

export interface ConfirmPaymentInput {
  transactionHash: string;
  status?: 'pending' | 'completed' | 'failed';
  verify?: boolean;
}

interface PaymentStore {
  payments: Payment[];
  selectedPayment: Payment | null;
  rates: Record<string, number>;
  loading: boolean;

  fetchPaymentsByUser: (userId?: string) => Promise<void>;
  fetchPaymentsByInvoice: (invoiceId: string) => Promise<void>;
  fetchPaymentById: (userId: string, id: string) => Promise<void>;
  initiatePayment: (data: InitiatePaymentInput) => Promise<string | null>;
  confirmPayment: (id: string, data: ConfirmPaymentInput) => Promise<void>;
  fetchRates: () => Promise<void>;
}

export const usePaymentStore = create<PaymentStore>((set, get) => ({
  payments: [],
  selectedPayment: null,
  rates: {},
  loading: false,

  async fetchPaymentsByUser(userId?: string) {
    set({ loading: true });
    try {
      const uid = userId || useAuthStore.getState().user?.id;
      if (!uid) throw new Error("User not authenticated");
      const res = await api.get(`/api/payments/user/${uid}`);
      set({ payments: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async fetchPaymentsByInvoice(invoiceId: string) {
    set({ loading: true });
    try {
      const res = await api.get(`/api/payments/invoice/${invoiceId}`);
      set({ payments: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async fetchPaymentById(userId: string, id: string) {
    set({ loading: true });
    try {
      const res = await api.get(`/api/payments/status/${userId}/${id}`);
      set({ selectedPayment: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async initiatePayment(data: InitiatePaymentInput) {
    set({ loading: true });
    try {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) throw new Error("User not authenticated");
      const res = await api.post(`/api/payments/initiate/${userId}`, data);
      await get().fetchPaymentsByUser();
      return res.data.data.id;
    } catch {
      return null;
    } finally {
      set({ loading: false });
    }
  },

  async confirmPayment(id: string, data: ConfirmPaymentInput) {
    set({ loading: true });
    try {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) throw new Error("User not authenticated");
      await api.post(`/api/payments/confirm/${userId}/${id}`, data);
      await get().fetchPaymentsByUser();
    } finally {
      set({ loading: false });
    }
  },

  async fetchRates() {
    set({ loading: true });
    try {
      const res = await api.get(`/api/payments/rates`);
      set({ rates: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
