// Centralized API client for the Invoisio backend
// Uses NEXT_PUBLIC_API_BASE; falls back to localhost for dev if not set

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001').replace(/\/$/, '')

export type Json = Record<string, any>

async function request<T = Json>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('evm_auth_token') : undefined
  const headersObj: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headersObj['Authorization'] = `Bearer ${token}`
  const h = init?.headers
  if (h) {
    if (h instanceof Headers) {
      h.forEach((v, k) => { headersObj[k] = v })
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headersObj[k] = String(v)
    } else {
      Object.assign(headersObj, h as Record<string, string>)
    }
  }
  const res = await fetch(url, {
    ...init,
    headers: headersObj,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status} ${res.statusText}: ${body}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    return (await res.json()) as T
  }
  return (await res.text()) as unknown as T
}

export const api = {
  health: {
    get: () => request<string>('/health', { method: 'GET' }),
  },
  auth: {
    wallet: {
      status: () => request<Json>('/api/auth/wallet/status', { method: 'GET' }),
      nonce: (walletAddress: string) =>
        request<Json>('/api/auth/wallet/nonce', {
          method: 'POST',
          body: JSON.stringify({ walletAddress }),
        }),
      connect: (payload: { walletAddress: string; signature: string; message: string }) =>
        request<Json>('/api/auth/wallet/connect', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      disconnect: (walletAddress: string) =>
        request<Json>('/api/auth/wallet/disconnect', {
          method: 'POST',
          body: JSON.stringify({ walletAddress }),
        }),
      verifySignature: (payload: { walletAddress: string; signature: string; message: string }) =>
        request<Json>('/api/auth/wallet/verify-signature', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
    },
  },
  invoices: {
    create: (payload: Json) => request<Json>('/api/invoices/create', { method: 'POST', body: JSON.stringify(payload) }),
    list: () => request<Json[]>('/api/invoices', { method: 'GET' }),
    get: (id: string) => request<Json>(`/api/invoices/${id}`, { method: 'GET' }),
    update: (id: string, payload: Json) =>
      request<Json>(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: string) => request<Json>(`/api/invoices/${id}`, { method: 'DELETE' }),
  },
  payments: {
    initiate: (payload: Json) => request<Json>('/api/payments/initiate', { method: 'POST', body: JSON.stringify(payload) }),
    status: (id: string) => request<Json>(`/api/payments/${id}/status`, { method: 'GET' }),
    rates: () => request<Json>('/api/payments/rates', { method: 'GET' }),
    confirm: (id: string, payload: Json) =>
      request<Json>(`/api/payments/${id}/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
  },
  ai: {
    generateInvoice: (payload: Json) => request<Json>('/api/ai/generate-invoice', { method: 'POST', body: JSON.stringify(payload) }),
  },
  notifications: {
    list: () => request<Json[]>('/api/notifications', { method: 'GET' }),
    markRead: (id: string) => request<Json>(`/api/notifications/${id}/read`, { method: 'POST' }),
    unreadCount: () => request<Json>('/api/notifications/unread-count', { method: 'GET' }),
  },
}

export default api