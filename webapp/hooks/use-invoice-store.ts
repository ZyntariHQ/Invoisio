import { create } from "zustand"

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
}

export interface InvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  clientName: string
  clientEmail: string
  clientAddress: string
  notes: string
  currency: string
  merchantWalletAddress?: string
  taxRate?: number
}

interface InvoiceStore {
  items: InvoiceItem[]
  invoiceData: InvoiceData
  showPreview: boolean
  setShowPreview: (open: boolean) => void
  setInvoiceData: (patch: Partial<InvoiceData>) => void
  addItem: () => void
  removeItem: (id: string) => void
  updateItem: (id: string, field: keyof InvoiceItem, value: string | number) => void
  setMerchantWalletAddress: (addr: string) => void
  setItems: (items: InvoiceItem[]) => void
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
  addItem: () => set(({ items }) => ({
    items: [
      ...items,
      { id: Date.now().toString(), description: "", quantity: 1, rate: 0, amount: 0 },
    ],
  })),
  removeItem: (id) => set(({ items }) => ({ items: items.filter((i) => i.id !== id) })),
  updateItem: (id, field, value) => set(({ items }) => ({
    items: items.map((item) => {
      if (item.id === id) {
        const updated: InvoiceItem = { ...item, [field]: value } as InvoiceItem
        if (field === "quantity" || field === "rate") {
          updated.amount = (updated.quantity || 0) * (updated.rate || 0)
        }
        return updated
      }
      return item
    }),
  })),
  setMerchantWalletAddress: (addr) => set({
    invoiceData: { ...get().invoiceData, merchantWalletAddress: addr || "" },
  }),
  setItems: (items) => set({ items }),
}))