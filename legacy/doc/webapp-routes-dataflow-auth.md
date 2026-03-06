# Legacy Webapp: Routes, Data Flow, and Auth

> **Save to:** `legacy/doc/webapp-routes-dataflow-auth.md`  
> **Scope:** `legacy/webapp/`

---

## Table of Contents

1. [Overview](#overview)
2. [Key Routes](#key-routes)
3. [Data Fetching Patterns](#data-fetching-patterns)
4. [Auth & Session State](#auth--session-state)
5. [UI Components and Data Relationships](#ui-components-and-data-relationships)
6. [Sequence Diagrams](#sequence-diagrams)

---

## Overview

The legacy webapp is a Next.js (App Router) application located in [`legacy/webapp/`](../webapp/). It handles invoice creation, management, payments, and a wallet-based (EVM) authentication flow. State is managed through Zustand stores, and API communication uses two separate clients depending on the feature area.

---

## Key Routes

All routes live under [`legacy/webapp/app/`](../webapp/app/).

### `/dashboard`
**File:** [`app/dashboard/page.tsx`](../webapp/app/dashboard/page.tsx)

The main landing page after login. It:
- Loads the invoice list via `api.invoices.list()` and computes summary stats (total invoices, active clients, total revenue, pending payments).
- Polls `api.notifications.list()` and `api.notifications.unreadCount()` every 60 seconds.
- Displays the 5 most recent invoices sorted by `createdAt`.
- Guards data fetches behind a check for `evm_auth_token` in `localStorage` — if absent, all lists are set to empty without hitting the API.
- Uses `useBasenameContext()` and `wagmi`'s `useAccount()` to display the connected wallet address or resolved basename.

**Main components used:** `Card`, `Button`, `Link` (Next.js), `useBasenameContext`, `useBasenameDisplay`

---

### `/invoices`
**File:** [`app/invoices/page.tsx`](../webapp/app/invoices/page.tsx)

The invoice list view. It:
- On mount, calls `api.invoices.list()` and maps the response to a normalized `Invoice` interface. If the API call fails, it falls back to a hardcoded `mockInvoices` array.
- Supports client-side filtering by search term (invoice number, client name, email) and status (`draft`, `sent`, `paid`, `overdue`).
- Displays summary cards for total revenue, paid invoices, and pending payments.
- Each row links to `/invoices/[id]` for detail view.

**Main components used:** `Card`, `Badge`, `Input`, `Select`, `DropdownMenu`, `Link`

---

### `/invoices/[id]`
**File:** [`app/invoices/[id]/page.tsx`](../webapp/app/invoices/[id]/page.tsx)

The invoice detail and edit page. It:
- Reads the `id` param via `useParams()` and fetches the invoice with `api.invoices.get(id)` on mount.
- Allows editing of title, client name/email, status, notes, and line items inline.
- Save calls `api.invoices.update(id, payload)`, delete calls `api.invoices.remove(id)` then redirects to `/invoices`.
- Computes `totalAmountUSD` from `invoice.total` or by summing `invoice.items`.
- Renders a `<CryptoPayment>` component at the bottom for on-chain payment of the invoice total.

**Main components used:** `Card`, `Input`, `Textarea`, `Button`, `CryptoPayment`, `useAccount` (wagmi)

---

### `/payment`
**File:** [`app/payment/page.tsx`](../webapp/app/payment/page.tsx)

A standalone crypto payment page (not tied to a specific invoice). It:
- Manages wallet connection via `wagmi`'s `useConnect` / `useDisconnect` / `useAccount`.
- Supports sending ETH natively or ERC-20 tokens (USDC, USDT) by encoding a raw `eth_sendTransaction` call through `window.ethereum`.
- Tracks a `SendStatus` state: `idle → connecting → ready → sending → sent/failed`.
- Does **not** call any backend API — all transactions go directly to the EVM chain.

**Main components used:** `Card`, `Select`, `Button`, `WalletConnectModal`, `useToast`

---

### `/create`
**File:** [`app/create/page.tsx`](../webapp/app/create/page.tsx)

The invoice creation form. It:
- Uses `useInvoiceStore()` (Zustand) for all form state: line items, invoice metadata, preview visibility.
- Syncs the connected wallet address (`wagmi` or `useEvmWallet`) into the store as `merchantWalletAddress`.
- Provides an **AI Generate** button that calls `api.ai.generateInvoice(payload)` to auto-populate line items. If the user is not authenticated, it prompts wallet connection first and retries on 401.
- **Download PDF** validates the form, saves to the backend via `api.invoices.create()`, serialises the invoice to `localStorage` under `invoice-preview`, and opens `/preview?print=1` in a new tab.
- **Send Invoice** opens an email draft via `sendInvoiceEmail()` from `lib/pdf-generator`.

**Main components used:** `InvoicePreview`, `CryptoPayment`, `Dialog`, `useInvoiceStore`, `useEvmWallet`, `useAppLoader`

---

### `/preview`
**File:** [`app/preview/page.tsx`](../webapp/app/preview/page.tsx)

A read-only print/share view. It:
- Reads invoice data from `localStorage` key `invoice-preview` (set by `/create`).
- If the `?print=1` query param is present, auto-triggers `generateInvoicePDF()` on load.
- Renders `<InvoicePreview>` with download and share handlers.

**Main components used:** `InvoicePreview`, `generateInvoicePDF`, `shareInvoicePDF`

---

## Data Fetching Patterns

The webapp uses **two separate API clients** for different historical reasons.

### `lib/axios.ts` — Axios Client (Auth-aware)
**File:** [`lib/axios.ts`](../webapp/lib/axios.ts)

```
baseURL: process.env.NEXT_PUBLIC_API_BASE || http://localhost:3001
withCredentials: true  (sends cookies for access/refresh tokens)
```

- Exports an `api` Axios instance.
- A **request interceptor** fetches the CSRF token via `getCookie()` and injects it as `X-CSRF-Token` on every outbound request.
- Used exclusively by `use-auth-store.ts` for all authentication endpoints (`/api/auth/wallet/*`).

---

### `lib/api.ts` — Fetch Client (EVM/Legacy)
**File:** [`lib/api.ts`](../webapp/lib/api.ts)

```
baseURL: process.env.NEXT_PUBLIC_API_BASE || http://localhost:3001
Auth:    Bearer token from localStorage key "evm_auth_token"
```

- Exports a structured `api` object with namespaced methods.
- Uses the native `fetch` API (not Axios).
- Reads `evm_auth_token` from `localStorage` and attaches it as an `Authorization: Bearer` header.
- **Does not** send cookies; intended for the legacy EVM wallet auth flow.

| Namespace | Methods |
|---|---|
| `api.health` | `get()` |
| `api.auth.wallet` | `status`, `nonce`, `connect`, `disconnect`, `verifySignature` |
| `api.invoices` | `create`, `list`, `get`, `update`, `remove` |
| `api.payments` | `initiate`, `status`, `rates`, `confirm` |
| `api.ai` | `generateInvoice` |
| `api.notifications` | `list`, `markRead`, `unreadCount` |

> **Note:** All route pages import from `lib/api.ts` (fetch client). Only `use-auth-store.ts` imports from `lib/axios.ts`.

---

## Auth & Session State

### `hooks/use-auth-store.ts`
**File:** [`hooks/use-auth-store.ts`](../webapp/hooks/use-auth-store.ts)

Manages the primary session state using **Zustand** with the `persist` middleware. State is serialised to `localStorage` under the key `auth-storage`.

**Persisted fields:**
- `user: User | null` — the authenticated user object
- `isAuthenticated: boolean`
- `csrfToken: string | null`

**Key actions:**

| Action | Behaviour |
|---|---|
| `fetchCsrfToken()` | Calls `GET /api/auth/wallet/csrf-token`, stores token in state and sets it as a default Axios header |
| `connectWallet()` | Calls `window.ethereum.request({ method: 'eth_requestAccounts' })` and returns the first address |
| `login(walletAddress)` | Calls `POST /api/auth/wallet/login`, sets `user` and `isAuthenticated: true` on success |
| `refresh()` | Calls `POST /api/auth/wallet/refresh` to rotate the session; sets `isAuthenticated: false` on failure |
| `logout()` | Calls `POST /api/auth/wallet/logout`, clears `user` and `isAuthenticated` |
| `checkAuth()` | Calls `GET /api/auth/wallet/me` to restore session on page load |

**How auth influences the UI:**

- **Dashboard & Invoices pages** check `localStorage.getItem('evm_auth_token')` directly before calling `lib/api.ts`. If absent, data fetches are skipped and lists are rendered empty — no redirect occurs.
- **Create page** checks `isConnected` (from `useEvmWallet` / wagmi) before saving to the backend or calling the AI endpoint. If not connected, it prompts a wallet connection flow and retries the operation.
- **`use-auth-store`** state (`isAuthenticated`, `user`) is available globally via Zustand and can be subscribed to in any component with `useAuthStore()`.

### Supporting hooks

| Hook | File | Purpose |
|---|---|---|
| `useEvmWallet` | [`hooks/use-evm-wallet.ts`](../webapp/hooks/use-evm-wallet.ts) | Wraps wagmi + `window.ethereum`; exposes `address`, `isConnected`, `connect`, `disconnect` |
| `useInvoiceStore` | [`hooks/use-invoice-store.ts`](../webapp/hooks/use-invoice-store.ts) | Zustand store for invoice form state (items, metadata, preview flag) |
| `usePaymentStore` | [`hooks/use-payment-store.ts`](../webapp/hooks/use-payment-store.ts) | Zustand store for payment flow state |
| `useBasenameContext` | [`hooks/use-basename.tsx`](../webapp/hooks/use-basename.tsx) | Resolves a Base L2 basename for a wallet address |

---

## UI Components and Data Relationships

| Component | File | Data Source |
|---|---|---|
| `InvoicePreview` | [`components/invoice-preview.tsx`](../webapp/components/invoice-preview.tsx) | Props from `useInvoiceStore` or `localStorage` (preview page) |
| `CryptoPayment` | [`components/crypto-payment.tsx`](../webapp/components/crypto-payment.tsx) | Receives `amount` + `currency` as props; reads wallet from wagmi |
| `PaymentStatus` | [`components/payment-status.tsx`](../webapp/components/payment-status.tsx) | Polls `api.payments.status(id)` |
| `WalletConnectModal` | [`components/wallet-connect-modal.tsx`](../webapp/components/wallet-connect-modal.tsx) | Delegates to wagmi connectors |
| `navigation.tsx` | [`components/navigation.tsx`](../webapp/components/navigation.tsx) | Reads `useAuthStore` for session display |

---

## Sequence Diagrams

### Load Invoices List (`/invoices`)

```
User                    InvoicesPage              lib/api.ts            Backend API
 │                           │                        │                      │
 │  Navigate to /invoices    │                        │                      │
 ├──────────────────────────>│                        │                      │
 │                           │  useEffect on mount    │                      │
 │                           │  Check localStorage    │                      │
 │                           │  for evm_auth_token    │                      │
 │                           │                        │                      │
 │                           │  api.invoices.list()   │                      │
 │                           ├───────────────────────>│                      │
 │                           │                        │  GET /api/invoices   │
 │                           │                        │  Authorization: Bearer <token>
 │                           │                        ├─────────────────────>│
 │                           │                        │  200 Invoice[]       │
 │                           │                        │<─────────────────────┤
 │                           │  mapped Invoice[]      │                      │
 │                           │<───────────────────────┤                      │
 │                           │                        │                      │
 │                           │  setInvoices(mapped)   │                      │
 │                           │  (fallback: mockInvoices if error)            │
 │                           │                        │                      │
 │  Renders table + stats    │                        │                      │
 │<──────────────────────────┤                        │                      │
```

---

### View Invoice Detail (`/invoices/[id]`)

```
User                  InvoiceDetailPage           lib/api.ts           Backend API
 │                          │                         │                     │
 │  Click invoice row       │                         │                     │
 ├─────────────────────────>│                         │                     │
 │                          │  useEffect([id])        │                     │
 │                          │  api.invoices.get(id)   │                     │
 │                          ├────────────────────────>│                     │
 │                          │                         │ GET /api/invoices/:id
 │                          │                         │ Authorization: Bearer <token>
 │                          │                         ├────────────────────>│
 │                          │                         │  200 Invoice        │
 │                          │                         │<────────────────────┤
 │                          │  setInvoice(data)       │                     │
 │                          │<────────────────────────┤                     │
 │                          │                         │                     │
 │  Renders edit form       │                         │                     │
 │  + CryptoPayment widget  │                         │                     │
 │<─────────────────────────┤                         │                     │
 │                          │                         │                     │
 │  [User edits + clicks Save]                        │                     │
 │─────────────────────────>│                         │                     │
 │                          │  api.invoices.update()  │                     │
 │                          ├────────────────────────>│                     │
 │                          │                         │ PUT /api/invoices/:id
 │                          │                         ├────────────────────>│
 │                          │                         │  200 Updated        │
 │                          │                         │<────────────────────┤
 │  toast("Invoice updated")│                         │                     │
 │<─────────────────────────┤                         │                     │
```

---

*Document generated from source files in `legacy/webapp/`. For backend route implementations, see [`legacy/backend-legacy/src/modules/`](../backend-legacy/src/modules/).*