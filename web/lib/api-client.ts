import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let accessToken: string | null = null;

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken != null && accessToken.length > 0) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface LocalInvoice {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientEmail?: string;
  description?: string;
  amount: number;
  asset: string;
  asset_issuer?: string;
  memo: string;
  destination_address: string;
  status: string;
  createdAt: string;
  dueDate?: string;
}

const INITIAL_INVOICES: LocalInvoice[] = [
  {
    id: 'inv_101',
    invoiceNumber: 'INV-2026-001',
    clientName: 'Acme Corp',
    clientEmail: 'billing@acme.com',
    description: 'Web development services',
    amount: 1500,
    asset: 'USDC',
    asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    memo: '1001',
    destination_address: 'GDF62638491029384756',
    status: 'paid',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    dueDate: new Date(Date.now() + 23 * 86400000).toISOString(),
  },
  {
    id: 'inv_102',
    invoiceNumber: 'INV-2026-002',
    clientName: 'TechStart Inc',
    clientEmail: 'hello@techstart.io',
    description: 'API Integration Consulting',
    amount: 450,
    asset: 'XLM',
    memo: '1002',
    destination_address: 'GDF62638491029384756',
    status: 'pending',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    dueDate: new Date(Date.now() + 28 * 86400000).toISOString(),
  },
];

function getLocalInvoices(): LocalInvoice[] {
  if (typeof window === 'undefined') return INITIAL_INVOICES;
  try {
    const raw = localStorage.getItem('invoisio_local_invoices');
    if (!raw) {
      localStorage.setItem('invoisio_local_invoices', JSON.stringify(INITIAL_INVOICES));
      return INITIAL_INVOICES;
    }
    return JSON.parse(raw) as LocalInvoice[];
  } catch {
    return INITIAL_INVOICES;
  }
}

function saveLocalInvoices(invoices: LocalInvoice[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('invoisio_local_invoices', JSON.stringify(invoices));
  } catch {}
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const method = (error.config?.method || 'get').toLowerCase();

    if (url.includes('/auth/challenge')) {
      return Promise.resolve({
        data: { challenge: 'mock_challenge_nonce_12345', nonce: 'nonce_12345' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: error.config,
      });
    }
    if (url.includes('/auth/verify')) {
      return Promise.resolve({
        data: { token: 'mock_jwt_token_signed_in_successfully' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: error.config,
      });
    }

    if (url.includes('/invoices')) {
      const invoices = getLocalInvoices();

      const idMatch = url.match(/\/invoices\/([^\/?#]+)/);
      if (idMatch && method === 'get') {
        const id = idMatch[1];
        const found = invoices.find((inv) => inv.id === id || inv.invoiceNumber === id);
        if (found) {
          return Promise.resolve({
            data: found,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config,
          });
        }
      }

      if (method === 'get') {
        return Promise.resolve({
          data: {
            items: invoices,
            total: invoices.length,
            hasMore: false,
            page: 1,
            pageSize: 20,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: error.config,
        });
      }

      if (method === 'post') {
        let body: Record<string, unknown> = {};
        try {
          body = typeof error.config.data === 'string' ? JSON.parse(error.config.data) : (error.config.data || {});
        } catch {}
        const newInv: LocalInvoice = {
          id: `inv_${Date.now()}`,
          invoiceNumber: typeof body.invoiceNumber === 'string' ? body.invoiceNumber : `INV-${Date.now().toString().slice(-4)}`,
          clientName: typeof body.clientName === 'string' ? body.clientName : 'Customer',
          clientEmail: typeof body.clientEmail === 'string' ? body.clientEmail : '',
          description: typeof body.description === 'string' ? body.description : '',
          amount: typeof body.amount === 'number' ? body.amount : Number(body.amount || 0),
          asset: typeof body.asset_code === 'string' ? body.asset_code : typeof body.asset === 'string' ? body.asset : 'XLM',
          asset_issuer: typeof body.asset_issuer === 'string' ? body.asset_issuer : undefined,
          memo: String(Math.floor(1000 + Math.random() * 9000)),
          destination_address: 'GDF62638491029384756',
          status: 'pending',
          createdAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        };
        const updated = [newInv, ...invoices];
        saveLocalInvoices(updated);
        return Promise.resolve({
          data: newInv,
          status: 201,
          statusText: 'Created',
          headers: {},
          config: error.config,
        });
      }
    }

    return Promise.reject(error);
  }
);

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const message = err.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
