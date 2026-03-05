-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "tx_hash" TEXT;
ALTER TABLE "invoices" ADD COLUMN "soroban_tx_hash" TEXT;
ALTER TABLE "invoices" ADD COLUMN "soroban_contract_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "metadata" JSONB;
