import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',
  port: int('PORT', 4000),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  encryptionKey: required('ENCRYPTION_KEY', '0'.repeat(64)),
  cookieSecure: bool('COOKIE_SECURE', false),
  cookieName: 'masiv_session',

  seedAdmin: {
    username: optional('ADMIN_USERNAME', 'masivteam'),
    password: optional('ADMIN_PASSWORD', 'masiv2010'),
  },

  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),

  expiryWorkerIntervalMs: int('EXPIRY_WORKER_INTERVAL_MS', 60_000),
  expiringThresholdDays: int('EXPIRING_THRESHOLD_DAYS', 7),
  paymentTimeoutMinutes: int('PAYMENT_TIMEOUT_MINUTES', 30),
} as const;

export type AppConfig = typeof config;
