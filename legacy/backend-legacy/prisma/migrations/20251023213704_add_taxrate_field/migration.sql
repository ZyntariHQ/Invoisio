-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientAddress" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "merchantWalletAddress" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "taxRate" DECIMAL(65,30),
ALTER COLUMN "currency" SET DEFAULT 'USDC',
ALTER COLUMN "subtotal" SET DEFAULT 0,
ALTER COLUMN "tax" SET DEFAULT 0,
ALTER COLUMN "total" SET DEFAULT 0;
