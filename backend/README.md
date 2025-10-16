# Invoisio Backend

This is the backend for the Invoisio application, built with NestJS.

## Features

- Wallet-based authentication
- Invoice CRUD operations
- AI-powered invoice generation
 - EVM (Base chain) payment initiation and status tracking

## Prerequisites

- Node.js 18+
- PostgreSQL
- pnpm (preferred) or npm
 - An EVM wallet (MetaMask or Coinbase Wallet)

## Setup

1. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. Fill in the environment variables in the `.env` file.
   - `EVM_RPC_URL` (e.g., `https://sepolia.base.org`)
   - `EVM_CHAIN_ID` (Base Sepolia: `84532`, Base mainnet: `8453`)

3. Install dependencies:
   ```bash
   npm install
   ```

4. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

5. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

## API Documentation

API documentation is available at `/docs` when the server is running.

## Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e
```