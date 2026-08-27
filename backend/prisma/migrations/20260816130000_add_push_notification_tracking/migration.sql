-- CreateEnum
CREATE TYPE "PushNotificationStatus" AS ENUM ('queued', 'ticket_ok', 'ticket_error', 'receipt_ok', 'receipt_error_permanent', 'receipt_error_retryable', 'token_removed');

-- CreateEnum
CREATE TYPE "PushNotificationFailureReason" AS ENUM ('DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig', 'MessageRateExceeded', 'ProviderError', 'InvalidProviderError', 'DeviceNotRegisteredOnPlatform', 'Unknown');

-- CreateTable
CREATE TABLE "push_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "status" "PushNotificationStatus" NOT NULL DEFAULT 'queued',
    "expo_ticket_id" TEXT,
    "ticket_error" TEXT,
    "ticket_error_details" JSONB,
    "ticket_created_at" TIMESTAMP(3),
    "receipt_status" TEXT,
    "receipt_message" TEXT,
    "receipt_failure_reason" "PushNotificationFailureReason",
    "receipt_fetched_at" TIMESTAMP(3),
    "receipt_details" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retried_at" TIMESTAMP(3),
    "removed_token_at" TIMESTAMP(3),
    "removed_token_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_notifications_expo_ticket_id_key" ON "push_notifications"("expo_ticket_id");

-- CreateIndex
CREATE INDEX "push_notifications_merchant_id_idx" ON "push_notifications"("merchant_id");

-- CreateIndex
CREATE INDEX "push_notifications_user_id_idx" ON "push_notifications"("user_id");

-- CreateIndex
CREATE INDEX "push_notifications_status_idx" ON "push_notifications"("status");

-- CreateIndex
CREATE INDEX "push_notifications_expo_ticket_id_idx" ON "push_notifications"("expo_ticket_id");

-- CreateIndex
CREATE INDEX "push_notifications_push_token_idx" ON "push_notifications"("push_token");

-- CreateIndex
CREATE INDEX "push_notifications_status_receipt_fetched_at_idx" ON "push_notifications"("status", "receipt_fetched_at");

-- AddForeignKey
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
