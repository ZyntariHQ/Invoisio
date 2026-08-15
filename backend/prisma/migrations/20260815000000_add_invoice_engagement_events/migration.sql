-- CreateInvoiceEngagementEvents: Add public invoice engagement funnel tracking

DO $$ BEGIN
    CREATE TYPE "InvoiceEngagementEventType" AS ENUM (
        'impression',
        'copy_destination',
        'copy_memo',
        'copy_payment_uri',
        'copy_asset',
        'wallet_launch',
        'qr_scan_attempt',
        'payment_intent_click',
        'print',
        'expand_payment_instructions'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "invoice_engagement_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
    "invoice_id" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
    "event_type" "InvoiceEngagementEventType" NOT NULL,
    "anonymized_visitor_id" VARCHAR(64) NOT NULL,
    "referrer" TEXT,
    "user_agent" TEXT,
    "viewport_width" INTEGER,
    "viewport_height" INTEGER,
    "locale" VARCHAR(16),
    "client_created_at" TIMESTAMPTZ,
    "device_category" VARCHAR(16),
    "session_id" VARCHAR(64),
    "funnel_step" INTEGER DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast scoping indexes for merchant analytics
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_merchant_id_idx"
    ON "invoice_engagement_events"("merchant_id");
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_invoice_id_idx"
    ON "invoice_engagement_events"("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_event_type_idx"
    ON "invoice_engagement_events"("event_type");
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_created_at_idx"
    ON "invoice_engagement_events"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_anonymized_visitor_id_idx"
    ON "invoice_engagement_events"("anonymized_visitor_id");
-- Composite index for main merchant analytics queries
CREATE INDEX IF NOT EXISTS "invoice_engagement_events_merchant_event_created_idx"
    ON "invoice_engagement_events"("merchant_id", "event_type", "created_at" DESC);
