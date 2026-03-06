# API Database Migrations

This document explains how the Invoisio backend uses Prisma to manage its PostgreSQL database schema, how to apply and generate migrations, an overview of the core tables, and how to handle seeding and test data.

---

## Schema and Migration File Locations

| File / Directory | Path |
|---|---|
| Prisma schema | `backend/prisma/schema.prisma` |
| Migrations directory | `backend/prisma/migrations/` |
| Seed file | `backend/prisma/seed.ts` (if present) |
| Prisma client config | generated via `npx prisma generate` |

The `schema.prisma` file is the single source of truth for the database structure. All model definitions, relations, and field mappings live there. The `migrations/` directory contains timestamped SQL migration files that track every schema change over time.

---

## Prerequisites

Make sure you have the following before running any Prisma commands:

1. **Node.js** installed (v20 recommended)
2. **Dependencies installed** from the backend directory:
   ```bash
   cd backend
   npm install
   ```
3. **A PostgreSQL database running** and a `.env` file in `backend/` with the connection string:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/invoisio_dev"
   ```

---

## Applying Existing Migrations Locally

To apply all existing migrations to your local database (safe for CI and production — does not create new migrations):

```bash
cd backend
npm run db:migrate
```

This runs `prisma migrate deploy` under the hood, which applies every pending migration in `backend/prisma/migrations/` in order.

**Expected output:**
```
Applying migration `20260303064920_init`
All migrations have been applied successfully.
```

If you see an error about the database not existing, create it first:
```bash
createdb invoisio_dev
```

---

## Generating a New Migration

When you make a change to `schema.prisma` (adding a model, a field, an index, etc.), generate a new migration with:

```bash
cd backend
npx prisma migrate dev --name describe_your_change
```

Replace `describe_your_change` with a short snake_case description of what changed, for example:

```bash
npx prisma migrate dev --name add_invoice_paid_at_field
```

**What this does:**
1. Diffs your updated `schema.prisma` against the current database state
2. Generates a new timestamped SQL file in `backend/prisma/migrations/`
3. Applies that migration to your local dev database immediately
4. Regenerates the Prisma client

> **Never edit migration files manually.** Always let Prisma generate them. Editing SQL files after the fact will cause checksum errors for other contributors.

---

## Regenerating the Prisma Client

If you pull changes that include schema updates, regenerate the client without running migrations:

```bash
cd backend
npx prisma generate
```

This is also run automatically by `npm install`, `npm run build`, and `npm test` via the `prepare`, `prebuild`, and `pretest` scripts in `package.json`.

---

## Schema Overview

### Entity Relationship Summary

```
users ──< invoices
(one user can have many invoices)
```

### `users` table

Maps to the `User` model in `schema.prisma`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, auto-generated |
| `public_key` | `text` | Unique — Stellar wallet public key used for auth |
| `email` | `text` | Optional |
| `nonce` | `text` | One-time nonce for wallet signature auth |
| `nonce_expires_at` | `bigint` | Unix timestamp for nonce expiry |
| `created_at` | `timestamptz` | Auto-set on creation |
| `updated_at` | `timestamptz` | Auto-updated on every write |

**Purpose:** Stores authenticated users, identified by their Stellar public key rather than a traditional username/password.

### `invoices` table

Maps to the `Invoice` model in `schema.prisma`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, auto-generated |
| `user_id` | `uuid` | Foreign key → `users.id`, nullable, `SET NULL` on user delete |
| `invoice_number` | `text` | Optional human-readable identifier |
| `client_name` | `text` | Required |
| `client_email` | `text` | Optional |
| `description` | `text` | Optional |
| `amount` | `decimal(18,7)` | Supports Stellar asset precision |
| `asset_code` | `text` | Stellar asset code (e.g. `XLM`, `USDC`) |
| `asset_issuer` | `text` | Stellar asset issuer address, null for native XLM |
| `memo` | `text` | Unique — used to match Stellar payment transactions |
| `memo_type` | `text` | Defaults to `"ID"` |
| `tx_hash` | `text` | Stellar transaction hash once paid |
| `status` | `text` | Defaults to `"pending"` — expected values: `pending`, `paid`, `cancelled` |
| `metadata` | `jsonb` | Arbitrary extra data |
| `due_date` | `timestamptz` | Optional payment deadline |
| `created_at` | `timestamptz` | Auto-set on creation |
| `updated_at` | `timestamptz` | Auto-updated on every write |

**Purpose:** Represents a payment request from a user to a client, settled on the Stellar blockchain. The `memo` field is the key that links an on-chain payment back to a specific invoice.

### Naming Conventions

- Table names are **plural snake_case** (`users`, `invoices`) set via `@@map`
- Multi-word column names use **snake_case** in the database via `@map` (e.g. `client_name`, `user_id`)
- Prisma model fields use **camelCase** in application code (e.g. `clientName`, `userId`)
- All primary keys are UUIDs generated by the database

---

## Seeding and Test Data

### Running the Seed Script

```bash
cd backend
npm run db:seed
```

This runs `prisma db seed`, which executes `backend/prisma/seed.ts` (or `seed.js`).

> If no seed file exists yet, you can create one at `backend/prisma/seed.ts` and register it in `backend/package.json`:
> ```json
> "prisma": {
>   "seed": "ts-node prisma/seed.ts"
> }
> ```

### Example Seed File

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { publicKey: 'GDUMMYPUBLICKEY000000000000000000000000000000000000000000' },
    update: {},
    create: {
      publicKey: 'GDUMMYPUBLICKEY000000000000000000000000000000000000000000',
      email: 'dev@example.com',
    },
  });

  await prisma.invoice.create({
    data: {
      userId: user.id,
      clientName: 'Acme Corp',
      clientEmail: 'acme@example.com',
      amount: 100.0000000,
      asset_code: 'XLM',
      memo: 'test-memo-001',
      status: 'pending',
    },
  });

  console.log('Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

### Test Data Management

For automated tests, the recommended pattern is to use a separate test database and reset it between test runs:

1. Add a test database URL to your `.env.test`:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/invoisio_test"
   ```

2. Reset and reseed before running tests:
   ```bash
   cd backend
   npx prisma migrate reset --force --skip-seed
   npm run db:seed
   npm test
   ```

   `migrate reset` drops the database, recreates it, and re-applies all migrations from scratch. The `--force` flag skips the confirmation prompt.

3. For unit tests that should not touch a real database, mock the Prisma client rather than connecting to a live instance.

---

## Quick Reference

| Task | Command |
|---|---|
| Apply existing migrations | `npm run db:migrate` |
| Generate a new migration | `npx prisma migrate dev --name <name>` |
| Regenerate Prisma client | `npx prisma generate` |
| Seed the database | `npm run db:seed` |
| Reset database (dev only) | `npx prisma migrate reset --force` |
| Open Prisma Studio (GUI) | `npx prisma studio` |
| Run tests | `npm test` |
| Run tests with coverage | `npm run test:cov` |