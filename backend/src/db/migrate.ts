import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { pool, query, closePool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      logger.info('db', `Migration already applied: ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info('db', `Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

/** Ensure single-row settings/policies exist and a default admin is present. */
async function seed(): Promise<void> {
  // bot_settings — exactly one row
  await query(`
    INSERT INTO bot_settings (bot_name, welcome_message, payment_network, payment_timeout_minutes)
    SELECT 'Masiv API', $1, 'TRC20', $2
    WHERE NOT EXISTS (SELECT 1 FROM bot_settings);
  `, [DEFAULT_WELCOME, config.paymentTimeoutMinutes]);

  // service_policies — exactly one row
  await query(`
    INSERT INTO service_policies (terms_of_service, privacy_policy, service_policy)
    SELECT $1, $2, $3
    WHERE NOT EXISTS (SELECT 1 FROM service_policies);
  `, [DEFAULT_TERMS, DEFAULT_PRIVACY, DEFAULT_SERVICE]);

  // default admin
  const { rows } = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM admins');
  if (Number(rows[0].count) === 0) {
    const hash = await bcrypt.hash(config.seedAdmin.password, 12);
    await query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
      [config.seedAdmin.username, hash],
    );
    logger.info('db', `Seeded admin user "${config.seedAdmin.username}"`);
  } else {
    logger.info('db', 'Admin user already exists — skipping seed');
  }
}

const DEFAULT_WELCOME = `🤖 Welcome to Masiv API

Hello! 👋

I'm the official Masiv API Store Bot.

You can use this bot to:

• 🛒 Buy AI API Token Packages
• 🔑 Receive your API credentials
• 📊 Check your package and expiry
• 📖 Access API Documentation
• 💬 Contact Support

━━━━━━━━━━━━━━━━━━

💱 PAYMENT RATE

$1 USD = 1 USDT

All prices are displayed in USD.
Payment is accepted in USDT.

━━━━━━━━━━━━━━━━━━

💳 PAYMENT

We currently accept:
• 🇰🇭 KHQR — scan with any Cambodian bank app (ABA, Wing, ACLEDA…)
• 💵 USDT Crypto — arranged with our Support team

━━━━━━━━━━━━━━━━━━

📜 IMPORTANT

Please review:

📄 Terms of Service
🛡 Privacy Policy
⚙️ Service Policy

By continuing, you agree to the applicable policies.`;

const DEFAULT_TERMS = `Terms of Service

By using Masiv API you agree to use the provided API credentials lawfully and
in accordance with the upstream provider's acceptable use policy. Access is
provided for the token amount and validity period of the package purchased.`;

const DEFAULT_PRIVACY = `Privacy Policy

We store only the data required to operate the service: your Telegram account
identifiers, your orders, and your payment records. We never share your data
with third parties except as required to process your purchase.`;

const DEFAULT_SERVICE = `Service Policy

API packages are delivered instantly after payment confirmation. Validity is
counted from the moment your API key is activated. Expired keys cannot be
renewed automatically — please purchase a new package.`;

async function main() {
  try {
    logger.info('db', 'Running migrations…');
    await runMigrations();
    logger.info('db', 'Seeding defaults…');
    await seed();
    logger.info('db', 'Migration + seed complete ✅');
  } catch (err) {
    logger.error('db', `Migration failed: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

// Run when invoked directly (npm run migrate).
main();
