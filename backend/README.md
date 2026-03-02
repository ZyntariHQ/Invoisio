# Invoisio Backend

Stellar-first NestJS API for Invoisio - a privacy-focused AI invoice generator on Stellar.

## Overview

This backend provides:
- **Health checks** (`GET /health`) for service monitoring
- **Invoice management** (`GET /invoices`, `POST /invoices`, etc.)
- **Stellar integration** (stubbed) ready for Horizon API and Soroban
- **Environment-based configuration** for testnet/mainnet

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file and update as needed:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Stellar Configuration
HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
MERCHANT_PUBLIC_KEY=GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# USDC Configuration
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
USDC_ASSET_CODE=USDC

# Memo Prefix for Payment Matching
MEMO_PREFIX=invoisio-
```

### 3. Run the Server

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The server will start on `http://localhost:3001`.

## API Endpoints

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "ok": true,
  "version": "0.0.1",
  "network": "testnet",
  "timestamp": "2026-03-02T12:00:00.000Z"
}
```

### Invoices

#### List all invoices

```bash
GET /invoices
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "invoiceNumber": "INV-001",
    "clientName": "Acme Corporation",
    "clientEmail": "billing@acme.com",
    "description": "Web development services - March 2026",
    "amount": 1500.00,
    "asset": "USDC",
    "memo": "invoisio-550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "destination": "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "createdAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T10:00:00.000Z",
    "dueDate": "2026-03-31T23:59:59.000Z"
  }
]
```

#### Get a single invoice

```bash
GET /invoices/:id
```

#### Create a new invoice

```bash
POST /invoices
Content-Type: application/json

{
  "invoiceNumber": "INV-004",
  "clientName": "New Client",
  "clientEmail": "client@example.com",
  "description": "Consulting services",
  "amount": 2500.00,
  "asset": "USDC"
}
```

#### Update invoice status

```bash
PATCH /invoices/:id/status
Content-Type: application/json

{
  "status": "paid"
}
```

## Testing

### Unit Tests

```bash
npm test
```

### E2E Tests

```bash
npm run test:e2e
```

### Test Coverage

```bash
npm run test:cov
```

## Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── app.config.ts
│   │   └── stellar.config.ts
│   ├── health/           # Health check module
│   │   ├── health.controller.ts
│   │   ├── health.module.ts
│   │   └── health.controller.spec.ts
│   ├── invoices/         # Invoice management module
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── invoices.controller.ts
│   │   ├── invoices.service.ts
│   │   ├── invoices.module.ts
│   │   └── invoices.service.spec.ts
│   ├── stellar/          # Stellar integration (stubbed)
│   │   ├── stellar.service.ts
│   │   └── stellar.module.ts
│   ├── app.module.ts     # Root module
│   └── main.ts           # Application entry point
├── test/
│   ├── app.e2e-spec.ts   # E2E tests
│   └── jest-e2e.json     # Jest E2E config
├── .env.example          # Environment template
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Design Decisions

### In-Memory Storage
This initial implementation uses in-memory storage for simplicity. Future iterations will integrate with PostgreSQL via Prisma.

### Invoice Fields
- **id**: UUID for unique identification
- **invoiceNumber**: Human-readable identifier
- **clientName/clientEmail**: Client contact info
- **amount/asset**: Payment details (XLM or USDC)
- **memo**: Stellar memo for payment matching (`invoisio-{id}`)
- **status**: pending | paid | overdue | cancelled
- **destination**: Merchant Stellar public key

### Stellar Integration (Stubbed)
The `StellarModule` currently provides stubbed methods. Future implementation will include:
- Horizon API integration for payment streaming
- Account balance queries
- Soroban smart contract interactions
- Automatic invoice status updates on payment receipt

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `CORS_ORIGIN` | Frontend URL for CORS | http://localhost:3000 |
| `HORIZON_URL` | Stellar Horizon API URL | https://horizon-testnet.stellar.org |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase | Test SDF Network ; September 2015 |
| `MERCHANT_PUBLIC_KEY` | Your Stellar receiving address | - |
| `USDC_ISSUER` | USDC issuer on Stellar | GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN |
| `USDC_ASSET_CODE` | USDC asset code | USDC |
| `MEMO_PREFIX` | Prefix for invoice memos | invoisi- |

## Future Enhancements

- [ ] PostgreSQL database integration via Prisma
- [ ] Authentication (wallet-based)
- [ ] Horizon payment streaming
- [ ] Soroban smart contract integration
- [ ] Email notifications
- [ ] PDF invoice generation
- [ ] Webhook support

## License

MIT
