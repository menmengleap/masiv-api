-- Masiv API — initial schema
-- Idempotent: safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- packages
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL UNIQUE,
    total_tokens BIGINT NOT NULL,

    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    default_valid_days INTEGER NOT NULL DEFAULT 30,

    description TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One canonical package per token amount (used for auto package sync).
CREATE UNIQUE INDEX IF NOT EXISTS uq_packages_total_tokens ON packages(total_tokens);

-- ─────────────────────────────────────────────────────────────
-- tokens (API stock)
--   token_value       : AES-256-GCM ciphertext of the API key (encrypted at rest)
--   token_fingerprint : HMAC-SHA256 of plaintext, for dedup (never sell/insert twice)
--   token_last4       : last 4 chars of plaintext, for masked display w/o decryption
--   price             : price captured at upload (package price may drift)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,

    base_url TEXT NOT NULL,

    token_value TEXT NOT NULL,
    token_fingerprint TEXT NOT NULL UNIQUE,
    token_last4 TEXT NOT NULL DEFAULT '****',

    total_tokens BIGINT NOT NULL,
    valid_days INTEGER NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,

    start_mode TEXT NOT NULL DEFAULT 'on_purchase'
        CHECK (start_mode IN ('on_purchase', 'immediate')),

    status TEXT NOT NULL DEFAULT 'stock'
        CHECK (status IN ('stock','reserved','active','expiring','expired','disabled')),

    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    is_used BOOLEAN NOT NULL DEFAULT FALSE,

    used_by BIGINT,
    assigned_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,

    telegram_user_id BIGINT UNIQUE,
    telegram_username TEXT,

    first_name TEXT,
    last_name TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- orders
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_number TEXT NOT NULL UNIQUE,

    customer_id BIGINT NOT NULL REFERENCES customers(id),

    package_id UUID NOT NULL REFERENCES packages(id),

    token_id UUID REFERENCES tokens(id),

    amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDT',

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','paid','processing','completed','cancelled','expired','refunded')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    currency TEXT NOT NULL DEFAULT 'USDT',
    amount NUMERIC(12,2) NOT NULL,

    network TEXT,
    wallet_address TEXT,
    transaction_hash TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','failed','expired','refunded')),

    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- A given on-chain tx hash may only confirm one payment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_tx_hash
    ON payments(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- telegram_users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_users (
    id BIGSERIAL PRIMARY KEY,

    telegram_user_id BIGINT NOT NULL UNIQUE,

    username TEXT,
    first_name TEXT,
    last_name TEXT,

    language_code TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- bot_settings (single row)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    bot_name TEXT NOT NULL DEFAULT 'Masiv API',

    usd_to_usdt NUMERIC(12,4) NOT NULL DEFAULT 1.0,

    payment_currency TEXT NOT NULL DEFAULT 'USDT',

    payment_wallet TEXT,
    payment_network TEXT,
    payment_timeout_minutes INTEGER NOT NULL DEFAULT 30,

    welcome_message TEXT,
    support_username TEXT,
    documentation_url TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- service_policies (single row)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    terms_of_service TEXT NOT NULL DEFAULT '',
    privacy_policy TEXT NOT NULL DEFAULT '',
    service_policy TEXT NOT NULL DEFAULT '',

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- admins
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,

    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,

    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tokens_status       ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_package      ON tokens(package_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at   ON tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_order      ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_id   ON telegram_users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at);

-- ─────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['packages','tokens','customers','telegram_users','admins']
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;', tbl
        );
        EXECUTE format(
            'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();', tbl
        );
    END LOOP;
END;
$$;
