-- Add KHQR payment gateway fields to bot_settings.

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS khqr_profile_id TEXT,
  ADD COLUMN IF NOT EXISTS khqr_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS khqr_enabled BOOLEAN NOT NULL DEFAULT FALSE;
