-- Migration: add_merchant_configuration_timestamps
-- Adds two nullable timestamp columns to `merchants` so the application can
-- distinguish intentionally configured values from auto-generated defaults.
--
-- name_configured_at  → set when the merchant explicitly saves a custom display
--                       name (replaces the auto-generated "Merchant GXXXXX" placeholder).
-- asset_configured_at → set when the merchant explicitly saves a preferred asset
--                       (replaces the schema default "XLM").
--
-- Both columns default to NULL, so all existing merchants start unconfigured,
-- which is the correct initial state (no inflation of onboarding progress).

ALTER TABLE "merchants"
  ADD COLUMN "name_configured_at"  TIMESTAMPTZ,
  ADD COLUMN "asset_configured_at" TIMESTAMPTZ;
