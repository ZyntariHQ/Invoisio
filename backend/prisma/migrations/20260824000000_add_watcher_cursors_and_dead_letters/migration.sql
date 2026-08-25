-- Durable cursors for live reconciliation watchers so restarts resume from
-- the last checkpoint instead of skipping payments that settled during downtime.
CREATE TYPE "WatcherName" AS ENUM ('horizon', 'soroban');

CREATE TABLE "watcher_cursors" (
    "watcher" "WatcherName" NOT NULL,
    "cursor" TEXT NOT NULL,
    "ledger" BIGINT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watcher_cursors_pkey" PRIMARY KEY ("watcher")
);

-- Poison-record quarantine: records that keep failing after the bounded
-- retry budget are parked here so they never stall cursor advancement,
-- but are never silently dropped either.
CREATE TABLE "watcher_dead_letters" (
    "id" TEXT NOT NULL,
    "watcher" "WatcherName" NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_cursor" TEXT,
    "payload" JSONB NOT NULL,
    "error_count" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watcher_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watcher_dead_letters_watcher_record_id_key" ON "watcher_dead_letters"("watcher", "record_id");

CREATE INDEX "watcher_dead_letters_watcher_status_idx" ON "watcher_dead_letters"("watcher", "status");
