import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import type { BotSettingsRow } from '../types.js';

/**
 * Full settings row, including the KHQR secret key.
 * INTERNAL USE ONLY — never return this straight to an HTTP client.
 * Use `getAdminSettings()` for anything that reaches a browser.
 */
export async function getSettings(): Promise<BotSettingsRow> {
  const { rows } = await query<BotSettingsRow>('SELECT * FROM bot_settings LIMIT 1');
  if (!rows[0]) throw notFound('Bot settings not initialized — run migrations');
  return rows[0];
}

/** Settings row as exposed to the admin dashboard: gateway secret redacted. */
export type AdminSettings = Omit<BotSettingsRow, 'khqr_secret_key'> & {
  /** Whether a secret key is stored. The value itself is never sent. */
  khqr_secret_key_set: boolean;
};

export async function getAdminSettings(): Promise<AdminSettings> {
  const { khqr_secret_key, ...rest } = await getSettings();
  return { ...rest, khqr_secret_key_set: Boolean(khqr_secret_key) };
}

export interface UpdateSettingsInput {
  bot_name?: string;
  usd_to_usdt?: number;
  payment_currency?: string;
  payment_wallet?: string | null;
  payment_network?: string | null;
  payment_timeout_minutes?: number;
  welcome_message?: string | null;
  support_username?: string | null;
  documentation_url?: string | null;
  khqr_profile_id?: string | null;
  /**
   * Write-only. Omit or pass '' to keep the stored key unchanged (the dashboard
   * never receives it back, so an untouched form must not wipe it).
   * Pass null to explicitly clear it.
   */
  khqr_secret_key?: string | null;
  khqr_enabled?: boolean;
  usdt_enabled?: boolean;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AdminSettings> {
  const current = await getSettings();

  // An empty string means "field left untouched in the form" — preserve the
  // existing secret rather than silently destroying the gateway config.
  const secretKey =
    input.khqr_secret_key === undefined || input.khqr_secret_key === ''
      ? current.khqr_secret_key
      : input.khqr_secret_key;

  const merged = { ...current, ...input, khqr_secret_key: secretKey };

  await query<BotSettingsRow>(
    `UPDATE bot_settings SET
        bot_name = $1,
        usd_to_usdt = $2,
        payment_currency = $3,
        payment_wallet = $4,
        payment_network = $5,
        payment_timeout_minutes = $6,
        welcome_message = $7,
        support_username = $8,
        documentation_url = $9,
        khqr_profile_id = $10,
        khqr_secret_key = $11,
        khqr_enabled = $12,
        usdt_enabled = $13,
        updated_at = NOW()
     WHERE id = $14`,
    [
      merged.bot_name,
      merged.usd_to_usdt,
      merged.payment_currency,
      merged.payment_wallet,
      merged.payment_network,
      merged.payment_timeout_minutes,
      merged.welcome_message,
      merged.support_username,
      merged.documentation_url,
      merged.khqr_profile_id ?? null,
      merged.khqr_secret_key ?? null,
      merged.khqr_enabled ?? false,
      merged.usdt_enabled ?? false,
      current.id,
    ],
  );

  return getAdminSettings();
}
