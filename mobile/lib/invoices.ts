import axios from "axios";
import { API_URL } from "@env";
import { useAuthStore } from "../hooks/use-auth-store";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { setCachedInvoices, getCachedInvoices } from "./cache";

export type InvoiceStatus = "pending" | "paid" | "expired";

export interface Invoice {
  id: string;
  invoiceNumber?: string;
  clientName?: string;
  clientEmail?: string;
  description?: string;
  amount: number;
  asset?: string;
  asset_code?: string;
  asset_issuer?: string;
  memo?: string;
  memo_type?: string;
  status: InvoiceStatus;
  destination?: string;
  destination_address?: string;
  createdAt: string;
  updatedAt?: string;
  dueDate?: string;
}

export interface InvoicesPage {
  items: Invoice[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
}

async function fetchInvoicesPage(
  page: number,
  pageSize: number,
  token: string | null,
): Promise<InvoicesPage> {
  const headers =
    token != null
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  }).toString();
  const url = `${API_URL}/invoices?${params}`;
  const response = await axios.get(url, headers ? { headers } : undefined);
  const data: unknown = response.data;

  if (Array.isArray(data)) {
    const items: Invoice[] = data as Invoice[];
    return {
      items,
      page,
      pageSize,
      total: items.length,
      hasMore: items.length === pageSize,
    };
  }

  const obj = (data ?? {}) as {
    items?: unknown;
    total?: unknown;
    hasMore?: unknown;
  };
  const items: Invoice[] = Array.isArray(obj.items)
    ? (obj.items as Invoice[])
    : [];
  const total: number | undefined =
    typeof obj.total === "number" ? obj.total : undefined;
  const hasMore =
    typeof obj.hasMore === "boolean"
      ? obj.hasMore
      : total != null
        ? page * pageSize < total
        : items.length === pageSize;

  return total != null
    ? { items, page, pageSize, hasMore, total }
    : { items, page, pageSize, hasMore };
}

export function useInvoicesList(pageSize = 20) {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  // seed cached data (if any) into the query cache so UI can show offline data
  // without blocking the hook caller. Read AsyncStorage in effect and set
  // the query data so components render immediately from cache when offline.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cached = await getCachedInvoices();
        if (mounted && cached?.pages) {
          queryClient.setQueryData([
            "invoices",
            pageSize,
            accessToken,
          ], { pages: cached.pages, pageParams: cached.pages.map((_, i) => i + 1) });
        }
      } catch (err) {
        console.error("seed cache error:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [accessToken, pageSize, queryClient]);

  return useInfiniteQuery({
    queryKey: ["invoices", pageSize, accessToken],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      fetchInvoicesPage(pageParam, pageSize, accessToken),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    onSuccess: async (data) => {
      try {
        // persist pages to AsyncStorage for offline use
        await setCachedInvoices(data.pages ?? []);
      } catch (err) {
        console.error("cache persist error:", err);
      }
    },
  });
}
