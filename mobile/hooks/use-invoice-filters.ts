import { create } from "zustand";
import type { InvoiceStatus } from "../lib/invoices";

/**
 * All filterable status options including "all" for the no-filter state.
 */
export type StatusFilter = "all" | InvoiceStatus;

export const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Cancelled", value: "cancelled" },
];

interface InvoiceFiltersState {
  /** Debounced search query sent to the API */
  search: string;
  /** Status filter (null = all) */
  status: StatusFilter;
  /** Transient text in the search input (not yet debounced) */
  searchDraft: string;

  setSearch: (value: string) => void;
  setSearchDraft: (value: string) => void;
  commitDraft: () => void;
  setStatus: (status: StatusFilter) => void;
  clearFilters: () => void;
}

/**
 * Persistent filter state for the invoice list.
 * Survives screen navigation since zustand stores are module-scoped singletons.
 */
export const useInvoiceFilters = create<InvoiceFiltersState>((set) => ({
  search: "",
  status: "all",
  searchDraft: "",

  setSearch: (value) => {
    set({ search: value });
  },
  setSearchDraft: (value) => {
    set({ searchDraft: value });
  },
  commitDraft: () => {
    set((state) => ({ search: state.searchDraft }));
  },
  setStatus: (status) => {
    set({ status });
  },
  clearFilters: () => {
    set({ search: "", searchDraft: "", status: "all" });
  },
}));
