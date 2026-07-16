-- CreateTable
CREATE TABLE "merchant_activation_checklists" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "profile_completed" BOOLEAN NOT NULL DEFAULT false,
    "payout_key_completed" BOOLEAN NOT NULL DEFAULT false,
    "asset_preference_completed" BOOLEAN NOT NULL DEFAULT false,
    "first_invoice_completed" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_activation_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_activation_checklists_merchant_id_key" ON "merchant_activation_checklists"("merchant_id");

-- AddForeignKey
ALTER TABLE "merchant_activation_checklists" ADD CONSTRAINT "merchant_activation_checklists_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
