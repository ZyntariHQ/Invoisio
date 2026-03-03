-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "publicKey" TEXT NOT NULL,
    "nonce" TEXT,
    "nonceExpiresAt" BIGINT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" UUID,
    "invoiceNumber" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "description" TEXT,
    "amount" DECIMAL(30,8) NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_issuer" TEXT,
    "memo" TEXT NOT NULL,
    "memo_type" TEXT NOT NULL DEFAULT 'ID',
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicKey_key" ON "User"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_memo_key" ON "Invoice"("memo");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
