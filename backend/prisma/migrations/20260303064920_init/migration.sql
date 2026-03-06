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

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_email" TEXT NOT NULL,
    "description" TEXT,
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
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_publicKey_key" ON "users"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_memo_key" ON "invoices"("memo");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;