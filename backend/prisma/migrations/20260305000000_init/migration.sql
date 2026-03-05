-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "email" TEXT,
    "nonce" TEXT,
    "nonceExpiresAt" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,7) NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_issuer" TEXT,
    "memo" TEXT NOT NULL,
    "memo_type" TEXT NOT NULL DEFAULT 'ID',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "destination_address" TEXT NOT NULL,
    "tx_hash" TEXT,
    "soroban_tx_hash" TEXT,
    "soroban_contract_id" TEXT,
    "metadata" JSONB,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_publicKey_key" ON "users"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_memo_key" ON "invoices"("memo");
