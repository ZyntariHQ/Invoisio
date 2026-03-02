import { create } from "zustand";
import { api } from "@/lib/axios";
import { useAuthStore } from "./use-auth-store";

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  notes: string;
  currency: string;
  merchantWalletAddress?: string;
  taxRate?: number;
}

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  notes?: string;
  currency?: string;
  merchantWalletAddress?: string;
  taxRate?: number;
  issueDate?: string;
  dueDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  createdAt: string;
}

interface InvoiceStore {
  items: InvoiceItem[];
  invoiceData: InvoiceData;
  showPreview: boolean;

  setShowPreview: (open: boolean) => void;
  setInvoiceData: (patch: Partial<InvoiceData>) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, field: keyof InvoiceItem, value: string | number) => void;
  setMerchantWalletAddress: (addr: string) => void;
  setItems: (items: InvoiceItem[]) => void;

  invoices: InvoiceResponse[];
  selectedInvoice: InvoiceResponse | null;
  loading: boolean;

  fetchInvoices: () => Promise<void>;
  fetchInvoicesByUser: (userId?: string) => Promise<void>;
  fetchInvoiceById: (id: string) => Promise<void>;
  createInvoice: () => Promise<string | null>;
  updateInvoice: (id: string) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  items: [{ id: "1", description: "", quantity: 1, rate: 0, amount: 0 }],
  invoiceData: {
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    clientName: "",
    clientEmail: "",
    clientAddress: "Client address not provided",
    notes: "",
    currency: "USD",
    merchantWalletAddress: "",
    taxRate: 10,
  },
  showPreview: false,
  setShowPreview: (open) => set({ showPreview: open }),
  setInvoiceData: (patch) => set({ invoiceData: { ...get().invoiceData, ...patch } }),
  addItem: () =>
    set(({ items }) => ({
      items: [...items, { id: Date.now().toString(), description: "", quantity: 1, rate: 0, amount: 0 }],
    })),
  removeItem: (id) => set(({ items }) => ({ items: items.filter((i) => i.id !== id) })),
  updateItem: (id, field, value) =>
    set(({ items }) => ({
      items: items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
              amount:
                field === "quantity" || field === "rate"
                  ? (field === "quantity" ? Number(value) : item.quantity) *
                    (field === "rate" ? Number(value) : item.rate)
                  : item.amount,
            }
          : item
      ),
    })),
  setMerchantWalletAddress: (addr) => set({ invoiceData: { ...get().invoiceData, merchantWalletAddress: addr || "" } }),
  setItems: (items) => set({ items }),

  invoices: [],
  selectedInvoice: null,
  loading: false,

  async fetchInvoices() {
    set({ loading: true });
    try {
      const res = await api.get(`/api/invoices`);
      set({ invoices: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async fetchInvoicesByUser(userId?: string) {
    set({ loading: true });
    try {
      const uid = userId || useAuthStore.getState().user?.id;
      if (!uid) throw new Error("User not authenticated");
      const res = await api.get(`/api/invoices/user/${uid}`);
      set({ invoices: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async fetchInvoiceById(id: string) {
    set({ loading: true });
    try {
      const res = await api.get(`/api/invoices/${id}`);
      set({ selectedInvoice: res.data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async createInvoice() {
    set({ loading: true });
    try {
      const body = { ...get().invoiceData, items: get().items };
      const res = await api.post(`/api/invoices/create`, body);
      await get().fetchInvoicesByUser();
      return res.data.data.id;
    } catch {
      return null;
    } finally {
      set({ loading: false });
    }
  },

  async updateInvoice(id: string) {
    set({ loading: true });
    try {
      const body = { ...get().invoiceData, items: get().items };
      await api.patch(`/api/invoices/${id}`, body);
      await get().fetchInvoicesByUser();
    } finally {
      set({ loading: false });
    }
  },

  async deleteInvoice(id: string) {
    set({ loading: true });
    try {
      await api.delete(`/api/invoices/${id}`);
      await get().fetchInvoicesByUser();
    } finally {
      set({ loading: false });
    }
  },
}));
