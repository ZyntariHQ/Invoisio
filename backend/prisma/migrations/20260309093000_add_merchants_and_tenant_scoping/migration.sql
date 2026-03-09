-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stellar_public_key" TEXT NOT NULL,
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_stellar_public_key_key" ON "merchants"("stellar_public_key");

-- AlterTable
ALTER TABLE "users" ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "merchant_id" TEXT;

-- Backfill merchants from existing users (1 merchant per user)
INSERT INTO "merchants" ("id", "name", "stellar_public_key", "webhook_url", "created_at", "updated_at")
SELECT
    "id",
    COALESCE(NULLIF("email", ''), CONCAT('Merchant ', SUBSTRING("publicKey", 1, 6))),
    "publicKey",
    "webhook_url",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("stellar_public_key") DO NOTHING;

-- Fallback merchant for orphan records
INSERT INTO "merchants" ("id", "name", "stellar_public_key", "webhook_url", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Default Merchant',
    'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("stellar_public_key") DO NOTHING;

-- Backfill users and invoices merchant ownership
UPDATE "users"
SET "merchant_id" = "id"
WHERE "merchant_id" IS NULL;

UPDATE "users"
SET "merchant_id" = '00000000-0000-0000-0000-000000000000'
WHERE "merchant_id" IS NULL;

UPDATE "invoices" i
SET "merchant_id" = u."merchant_id"
FROM "users" u
WHERE i."user_id" = u."id" AND i."merchant_id" IS NULL;

UPDATE "invoices"
SET "merchant_id" = '00000000-0000-0000-0000-000000000000'
WHERE "merchant_id" IS NULL;

-- Enforce tenant foreign keys and not-null constraints
ALTER TABLE "users" ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "merchant_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "users_merchant_id_idx" ON "users"("merchant_id");
CREATE INDEX "invoices_merchant_id_idx" ON "invoices"("merchant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
