import axios from "axios";
import { API_URL } from "@env";
import { useAuthStore } from "../hooks/use-auth-store";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { setCachedInvoices, getCachedInvoices } from "./cache";
import { offlineQueue } from "./offline-queue";
import { useConnectivity } from "../hooks/use-connectivity";

export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";

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
  search?: string,
  status?: string,
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
  });
  if (search && search.trim().length > 0) {
    params.set("search", search.trim());
  }
  if (status && status !== "all") {
    params.set("status", status);
  }
  const url = `${API_URL}/invoices?${params.toString()}`;
  
  try {
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
  } catch (error) {
    // Handle offline requests: queue and return cached data if available
    if (axios.isAxiosError(error) && !error.response) {
      // Network error - try to get from cache
      const cached = await getCachedInvoices();
      // Check if we have cached data for this page
      if (cached?.pages && cached.pages.length > 0 && cached.pages[page - 1]) {
        // Type assertion to ensure it matches InvoicesPage
        return cached.pages[page - 1] as InvoicesPage;
      }
      
      // Queue the request for retry when online
      await offlineQueue.enqueue(url, "GET", undefined, headers);
      
      // Return empty page with no more data
      return {
        items: [],
        page,
        pageSize,
        hasMore: false,
        total: 0,
      };
    }
    throw error;
  }
}

export function useInvoicesList(
  pageSize = 20,
  search?: string,
  status?: string,
) {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const { isOffline } = useConnectivity();

  // Derive effective filter values
  const effectiveSearch =
    search && search.trim().length > 0 ? search.trim() : undefined;
  const effectiveStatus = status && status !== "all" ? status : undefined;

  // seed cached data (if any) into the query cache so UI can show offline data
  // without blocking the hook caller. Read AsyncStorage in effect and set
  // the query data so components render immediately from cache when offline.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await getCachedInvoices();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may be mutated by cleanup
        if (!cancelled && cached?.pages) {
          queryClient.setQueryData(
            [
              "invoices",
              pageSize,
              accessToken,
              effectiveSearch,
              effectiveStatus,
            ],
            {
              pages: cached.pages,
              pageParams: cached.pages.map((_, i) => i + 1),
            },
          );
        }
      } catch (err) {
        console.error("seed cache error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, pageSize, queryClient, effectiveSearch, effectiveStatus]);

  const query = useInfiniteQuery({
    queryKey: [
      "invoices",
      pageSize,
      accessToken,
      effectiveSearch,
      effectiveStatus,
      isOffline, // Refetch when coming online
    ],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      fetchInvoicesPage(
        pageParam,
        pageSize,
        accessToken,
        effectiveSearch,
        effectiveStatus,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: isOffline ? 1000 * 60 * 5 : 1000 * 30, // Keep data fresh longer when offline
  });

  // Persist fetched pages to AsyncStorage for offline use
  useEffect(() => {
    if (query.data) {
      setCachedInvoices(query.data.pages).catch((err: unknown) => {
        console.error("cache persist error:", err);
      });
    }
  }, [query.data]);

  return query;
}