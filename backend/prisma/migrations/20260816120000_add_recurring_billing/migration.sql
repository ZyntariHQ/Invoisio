-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RecurringScheduleStatus" AS ENUM ('active', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "recurring_schedules" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "amount" DECIMAL(18,7) NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_issuer" TEXT,
    "description" TEXT,
    "frequency" "RecurringFrequency" NOT NULL,
    "status" "RecurringScheduleStatus" NOT NULL DEFAULT 'active',
    "next_run_date" TIMESTAMP(3) NOT NULL,
    "last_generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_runs" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_invoice_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_schedules_merchant_id_idx" ON "recurring_schedules"("merchant_id");

-- CreateIndex
CREATE INDEX "recurring_schedules_status_next_run_date_idx" ON "recurring_schedules"("status", "next_run_date");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_invoice_runs_invoice_id_key" ON "recurring_invoice_runs"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_invoice_runs_schedule_id_period_key_key" ON "recurring_invoice_runs"("schedule_id", "period_key");

-- AddForeignKey
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
