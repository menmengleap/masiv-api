import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import type { BotSettingsRow } from '../types.js';

export async function getSettings(): Promise<BotSettingsRow> {
  const { rows } = await query<BotSettingsRow>('SELECT * FROM bot_settings LIMIT 1');
  if (!rows[0]) throw notFound('Bot settings not initialized — run migrations');
  return rows[0];
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
}

export async function updateSettings(input: UpdateSettingsInput): Promise<BotSettingsRow> {
  const current = await getSettings();
  const merged = { ...current, ...input };
  const { rows } = await query<BotSettingsRow>(
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
        updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
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
      current.id,
    ],
  );
  return rows[0];
}
