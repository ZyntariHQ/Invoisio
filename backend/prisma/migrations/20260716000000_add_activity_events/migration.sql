-- Create ActivityEvent model for in-app activity feed
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "user_id" UUID,
    "invoice_id" UUID,
    "type" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT,
    CONSTRAINT "activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "activity_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL
);

CREATE INDEX "activity_events_merchant_id_idx" ON "activity_events"("merchant_id");
CREATE INDEX "activity_events_merchant_id_type_idx" ON "activity_events"("merchant_id", "type");
CREATE INDEX "activity_events_created_at_idx" ON "activity_events"("created_at" DESC);