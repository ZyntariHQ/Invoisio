-- Prevent the same on-chain transaction from being recorded as more than
-- one Payment row (replay/duplicate-processing guard).
CREATE UNIQUE INDEX "payments_tx_hash_key" ON "payments"("tx_hash");
