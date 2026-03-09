-- Enable pg_trgm for trigram similarity indexes
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Composite GIN index for full-text search over key client fields
CREATE INDEX "invoices_search_document_idx"
ON "invoices"
USING GIN (
  to_tsvector(
    'simple',
    coalesce("client_name", '') || ' ' ||
    coalesce("client_email", '') || ' ' ||
    coalesce("memo", '')
  )
);

-- Trigram indexes to accelerate ILIKE/similarity matches
CREATE INDEX "invoices_client_name_trgm_idx"
ON "invoices"
USING GIN ("client_name" gin_trgm_ops);

CREATE INDEX "invoices_client_email_trgm_idx"
ON "invoices"
USING GIN ("client_email" gin_trgm_ops);

CREATE INDEX "invoices_memo_trgm_idx"
ON "invoices"
USING GIN ("memo" gin_trgm_ops);
