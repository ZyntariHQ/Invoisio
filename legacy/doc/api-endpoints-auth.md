# Legacy API (NestJS) — Endpoints and Auth

This reference documents the Legacy API that powers the legacy webapp. It covers local setup, the authentication scheme, core resources (Invoices, Payments, Users), request/response formats, common errors, and copy‑paste‑ready cURL examples. The API base URL defaults to `http://localhost:3001`.

## Setup

- Node (local)
  - Prerequisites: Node.js 18+, PostgreSQL reachable at `DATABASE_URL`
  - Steps:
    - Set environment variables (examples):  
      - `DATABASE_URL=postgresql://postgres:password@localhost:5432/invoisio`  
      - `JWT_SECRET=your-jwt-secret`  
      - `JWT_REFRESH_SECRET=your-jwt-refresh-secret`  
      - `EVM_RPC_URL=https://sepolia.base.org`  
      - `EVM_CHAIN_ID=84532`  
      - `PORT=3001`  
      - `CORS_ORIGIN=http://localhost:3000`
    - Install deps and generate Prisma client:  
      - `npm install`  
      - `npx prisma generate`  
      - `npx prisma migrate dev`
    - Run: `npm run start:dev`
    - Health check: `curl http://localhost:3001/health`
- Docker Compose
  - From [docker-compose.yml](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/docker-compose.yml): `docker compose up -d`
  - Services: `backend` (3001/tcp), `db` (Postgres 13)
  - Access: health `http://localhost:3001/health`, Swagger `http://localhost:3001/docs`
- Docker (image build)
  - Build: `docker build -t invoisio-legacy-api .` in [backend-legacy](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy)
  - Run (example):  
    `docker run -p 3001:3001 -e DATABASE_URL=postgresql://postgres:password@host.docker.internal:5432/invoisio -e JWT_SECRET=your-jwt-secret -e JWT_REFRESH_SECRET=your-jwt-refresh-secret -e EVM_RPC_URL=https://sepolia.base.org -e EVM_CHAIN_ID=84532 -e PORT=3001 -e CORS_ORIGIN=http://localhost:3000 invoisio-legacy-api`

## Auth Overview

- Scheme: Bearer JWT
  - Guard: [JwtAuthGuard](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/common/guards/jwt-auth.guard.ts) with [JwtStrategy](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/auth/strategies/jwt.strategy.ts)
  - Extraction: `Authorization: Bearer <token>`
  - Signing payload: `{ sub: <userId>, walletAddress: <0x...> }`
  - Secret: `JWT_SECRET`
- SIWE (Sign-In With Ethereum) flow
  - Request nonce → Verify signature → Connect wallet → Receive JWT
  - Implemented in [auth.service.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/auth/auth.service.ts#L21-L66)
- Cookie tokens (access/refresh)
  - Endpoints `/login`, `/refresh`, `/logout` set/clear `httpOnly` cookies
  - Intended for browser use; protected endpoints still expect Bearer JWT
- CSRF
  - Middleware issues a CSRF cookie and token; send `X-CSRF-Token` header
  - Setup in [main.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/main.ts#L35-L46)

## Response Envelope and Errors

- Success responses are wrapped: `{ "data": <payload> }` via [TransformInterceptor](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/common/interceptors/transform.interceptor.ts)
- Errors use a consistent shape: `{ "error": "<message>", "traceId": "<id>" }` via [HttpExceptionFilter](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/common/filters/http-exception.filter.ts)
- Common status codes:
  - 200 for success
  - 400 for validation/signature errors
  - 401 for missing/invalid JWT
  - 404 for not found (invoice/payment)

## Swagger Docs

- Generated at runtime with bearer auth: [swagger.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/docs/swagger.ts)
- Open in browser: `http://localhost:3001/docs`

## Base URL

- Default base: `http://localhost:3001`
- Legacy webapp uses `NEXT_PUBLIC_API_BASE` to override

## Auth: Wallet

Controller: [auth.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/auth/auth.controller.ts)

- GET /api/auth/wallet/csrf-token
  - Response: `{ data: { csrfToken: string } }`
  - cURL:  
    `curl -i http://localhost:3001/api/auth/wallet/csrf-token`
- GET /api/auth/wallet/me (protected)
  - Headers: `Authorization: Bearer <JWT>`
  - Response: `{ data: { user: { userId, walletAddress } } }`
  - cURL:  
    `curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/auth/wallet/me`
- POST /api/auth/wallet/nonce
  - Body: `{ "walletAddress": "0x<40-hex>" }`
  - Response: `{ data: { nonce, expiresAt, chainId, domain } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/nonce -H "Content-Type: application/json" -d '{"walletAddress":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'`
- POST /api/auth/wallet/verify-signature
  - Body: `{ walletAddress, signature, message }` (SIWE)
  - Response: `{ data: { valid: true } }`
  - Errors: 400 invalid/expired/mismatch
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/verify-signature -H "Content-Type: application/json" -d '{"walletAddress":"0x...","signature":"0x...","message":"..."}'`
- POST /api/auth/wallet/connect
  - Body: `{ walletAddress, signature, message }`
  - Response: `{ data: { token, user: { id, walletAddress } } }` (JWT in `token`)
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/connect -H "Content-Type: application/json" -d '{"walletAddress":"0x...","signature":"0x...","message":"..."}'`
- POST /api/auth/wallet/login
  - Body: `{ walletAddress }`
  - Sets cookies: `access_token` (15m), `refresh_token` (7d)
  - Response: `{ data: { message, user } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/login -H "Content-Type: application/json" -d '{"walletAddress":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' -c cookies.txt`
- POST /api/auth/wallet/refresh
  - Requires cookie: `refresh_token`
  - Response: `{ data: { message: "Access token refreshed" } }` and sets `access_token`
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/refresh -b cookies.txt -c cookies.txt`
- POST /api/auth/wallet/logout
  - Clears `access_token`, `refresh_token`
  - Response: `{ data: { message: "Wallet disconnected successfully" } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/logout -b cookies.txt`
- POST /api/auth/wallet/disconnect (protected)
  - Headers: `Authorization: Bearer <JWT>`
  - Response: `{ data: { success: true } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/auth/wallet/disconnect -H "Authorization: Bearer $TOKEN"`
- GET /api/auth/wallet/status (protected)
  - Headers: `Authorization: Bearer <JWT>`
  - Response: `{ data: { walletAddress, userId } }`
  - cURL:  
    `curl http://localhost:3001/api/auth/wallet/status -H "Authorization: Bearer $TOKEN"`

## Invoices

Controller: [invoices.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/invoices/invoices.controller.ts)  
DTOs: [create-invoice.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/invoices/dto/create-invoice.dto.ts), [update-invoice.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/invoices/dto/update-invoice.dto.ts), [invoice-item.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/invoices/dto/invoice-item.dto.ts)

- POST /api/invoices/create (protected)
  - Headers: `Authorization: Bearer <JWT>`
  - Body:
    ```
    {
      "invoiceNumber": "INV-1001",
      "clientName": "Acme Co",
      "clientEmail": "billing@acme.co",
      "clientAddress": "123 Main St",
      "notes": "Net 30",
      "currency": "USD",
      "merchantWalletAddress": "0x... (optional)",
      "taxRate": 7.5,
      "issueDate": "2026-03-01",
      "dueDate": "2026-03-31",
      "items": [
        { "id":"item-1","description":"Design","quantity":10,"rate":100,"amount":1000 }
      ]
    }
    ```
  - Response: `{ data: { id, subtotal, tax, total, ... } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/invoices/create -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @payload.json`
- GET /api/invoices (protected)
  - Query: `page`, `limit`, `status`, `search`
  - Response: `{ data: { invoices: [...], total, page, limit } }`
  - cURL:  
    `curl "http://localhost:3001/api/invoices?page=1&limit=10" -H "Authorization: Bearer $TOKEN"`
- GET /api/invoices/:id (protected)
  - Response: `{ data: { id, items, subtotal, tax, total, payments: [...] } }`
  - Errors: 404 when not found
  - cURL:  
    `curl http://localhost:3001/api/invoices/INV_ID -H "Authorization: Bearer $TOKEN"`
- PATCH /api/invoices/:id (protected)
  - Body: partial of CreateInvoiceDto; recalculates subtotal/tax/total when `items` or `taxRate` provided
  - Response: `{ data: { ...updatedInvoice } }`
  - cURL:  
    `curl -X PATCH http://localhost:3001/api/invoices/INV_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"notes":"Updated"}'`
- DELETE /api/invoices/:id (protected)
  - Response: `{ data: { ...deletedInvoice } }`
  - cURL:  
    `curl -X DELETE http://localhost:3001/api/invoices/INV_ID -H "Authorization: Bearer $TOKEN"`
- GET /api/invoices/user/:id (protected)
  - Response: `{ data: [ ...invoices ] }`
  - cURL:  
    `curl http://localhost:3001/api/invoices/user/USER_ID -H "Authorization: Bearer $TOKEN"`

## Payments

Controller: [payments.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/payments/payments.controller.ts)  
DTOs: [initiate-payment.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/payments/dto/initiate-payment.dto.ts), [confirm-payment.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/payments/dto/confirm-payment.dto.ts)

- POST /api/payments/initiate/:userId (protected)
  - Headers: `Authorization: Bearer <JWT>`
  - Body:
    ```
    {
      "invoiceId": "INV_ID",
      "token": "ETH" | "USDC" | "USDT",
      "amount": "100.00",
      "merchantAddress": "0x... (optional)"
    }
    ```
  - Response: `{ data: { paymentId, status } }`
  - Errors: 404 when invoice not found/belongs to other user
  - cURL:  
    `curl -X POST http://localhost:3001/api/payments/initiate/USER_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"invoiceId":"INV_ID","token":"USDC","amount":"100.00"}'`
- GET /api/payments/status/:userId/:id (protected)
  - Response: `{ data: { status, transactionHash } }`
  - Errors: 404 when payment not found
  - cURL:  
    `curl http://localhost:3001/api/payments/status/USER_ID/PAYMENT_ID -H "Authorization: Bearer $TOKEN"`
- GET /api/payments/rates (protected)
  - Response: `{ data: { rates: { ETH, USDC, USDT }, source, timestamp } }`
  - cURL:  
    `curl http://localhost:3001/api/payments/rates -H "Authorization: Bearer $TOKEN"`
- POST /api/payments/confirm/:userId/:id (protected)
  - Body:
    ```
    {
      "transactionHash": "0x...",
      "status": "completed" | "failed" | "pending",
      "verify": true | false
    }
    ```
  - Response: `{ data: { paymentId, status, transactionHash, verified } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/payments/confirm/USER_ID/PAYMENT_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"transactionHash":"0x...","verify":true}'`
- GET /api/payments/user/:id (protected)
  - Response: `{ data: [ ...paymentsWithInvoice ] }`
  - cURL:  
    `curl http://localhost:3001/api/payments/user/USER_ID -H "Authorization: Bearer $TOKEN"`
- GET /api/payments/invoice/:id (protected)
  - Response: `{ data: [ ...paymentsWithUser ] }`
  - cURL:  
    `curl http://localhost:3001/api/payments/invoice/INVOICE_ID -H "Authorization: Bearer $TOKEN"`

## Users

Controller: [users.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/users/users.controller.ts)  
DTOs: [create-user.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/users/dto/create-user.dto.ts), [update-user.dto.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/users/dto/update-user.dto.ts)

- POST /api/users (protected)
  - Body: `{ "walletAddress": "0x...", "nonce": "..." }`
  - Response: `{ data: { id, walletAddress, ... } }`
  - cURL:  
    `curl -X POST http://localhost:3001/api/users -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"walletAddress":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'`
- GET /api/users (protected)
  - Response: `{ data: [ ...users ] }`
  - cURL:  
    `curl http://localhost:3001/api/users -H "Authorization: Bearer $TOKEN"`
- GET /api/users/:id (protected)
  - Response: `{ data: { id, walletAddress, ... } }`
  - cURL:  
    `curl http://localhost:3001/api/users/USER_ID -H "Authorization: Bearer $TOKEN"`
- GET /api/users/wallet/:walletAddress (protected)
  - Response: `{ data: { id, walletAddress, ... } }`
  - cURL:  
    `curl http://localhost:3001/api/users/wallet/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -H "Authorization: Bearer $TOKEN"`
- PATCH /api/users/:id (protected)
  - Body: partial of UpdateUserDto
  - Response: `{ data: { ...updatedUser } }`
  - cURL:  
    `curl -X PATCH http://localhost:3001/api/users/USER_ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nonce":"new-nonce"}'`
- DELETE /api/users/:id (protected)
  - Response: `{ data: { ...deletedUser } }`
  - cURL:  
    `curl -X DELETE http://localhost:3001/api/users/USER_ID -H "Authorization: Bearer $TOKEN"`

## Misc

- Health
  - GET /health → `{ data: { status: "ok" } }`  
    `curl http://localhost:3001/health`
- AI
  - POST /api/ai/generate-invoice (protected)  
    Body: `{ prompt: string }` → `{ data: { invoiceDraft: ... } }`  
    Controller: [ai.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/ai/ai.controller.ts)  
    `curl -X POST http://localhost:3001/api/ai/generate-invoice -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"prompt":"..."}'`
- Notifications
  - GET /api/notifications (protected, optional query: `page`, `limit`, `unread=true|false`)  
    POST /api/notifications/:id/read (protected)  
    GET /api/notifications/unread-count (protected)  
    Controller: [notifications.controller.ts](file:///Users/ew/waves2/Invoisio/legacy/backend-legacy/src/modules/notifications/notifications.controller.ts)

## Notes for Contributors

- Always include `Authorization: Bearer <JWT>` for protected endpoints
- Include `X-CSRF-Token` when making state‑changing requests from browsers
- Swagger at `/docs` is the quickest way to explore live endpoints

