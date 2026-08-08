import { config } from '../config/index.js';
import { db, query, withTransaction, type Queryable } from '../db/pool.js';
import { DAYS_LEFT_SQL, effectiveStatusSql } from '../db/sql.js';
import { conflict, notFound } from '../lib/errors.js';
import { encrypt, decrypt, fingerprint, last4, maskFromLast4 } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { normalizeTokens } from '../lib/tokens.js';
import type { StartMode, TokenStatus } from '../types.js';
import { findOrCreatePackage } from './package.service.js';

/** A token row prepared for API responses — the key is ALWAYS masked here. */
export interface TokenView {
  id: string;
  package_id: string | null;
  package_name: string | null;
  base_url: string;
  masked_key: string;
  total_tokens: string;
  valid_days: number;
  price: string;
  start_mode: StartMode;
  status: TokenStatus;
  effective_status: TokenStatus;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_used: boolean;
  customer_id: string | null;
  customer_label: string | null;
  assigned_at: string | null;
  created_at: string;
}

interface TokenViewRaw {
  id: string;
  package_id: string | null;
  package_name: string | null;
  base_url: string;
  token_last4: string;
  total_tokens: string;
  valid_days: number;
  price: string;
  start_mode: StartMode;
  status: TokenStatus;
  effective_status: TokenStatus;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_used: boolean;
  used_by: string | null;
  customer_label: string | null;
  assigned_at: string | null;
  created_at: string;
}

const VIEW_SELECT = `
  SELECT
    t.id, t.package_id, p.name AS package_name,
    t.base_url, t.token_last4,
    t.total_tokens, t.valid_days, t.price,
    t.start_mode, t.status,
    ${effectiveStatusSql(config.expiringThresholdDays)} AS effective_status,
    t.started_at, t.expires_at,
    ${DAYS_LEFT_SQL} AS days_left,
    t.is_used, t.used_by,
    NULLIF(TRIM(COALESCE(c.telegram_username, '') || ' ' ||
                COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') AS customer_label,
    t.assigned_at, t.created_at
  FROM tokens t
  LEFT JOIN packages p ON p.id = t.package_id
  LEFT JOIN customers c ON c.id = t.used_by
`;

function toView(r: TokenViewRaw): TokenView {
  return {
    id: r.id,
    package_id: r.package_id,
    package_name: r.package_name,
    base_url: r.base_url,
    masked_key: maskFromLast4(r.token_last4),
    total_tokens: r.total_tokens,
    valid_days: r.valid_days,
    price: r.price,
    start_mode: r.start_mode,
    status: r.status,
    effective_status: r.effective_status,
    started_at: r.started_at,
    expires_at: r.expires_at,
    days_left: r.days_left,
    is_used: r.is_used,
    customer_id: r.used_by,
    customer_label: r.customer_label,
    assigned_at: r.assigned_at,
    created_at: r.created_at,
  };
}

export interface UploadTokenInput {
  api_key: string;
  base_url: string;
  total_tokens: string | number;
  valid_days: number;
  price: number;
  start_mode: StartMode;
  package_name?: string;
  description?: string | null;
}

export interface UploadResult {
  token: TokenView;
  package: { id: string; name: string; total_tokens: string; created: boolean };
  stock_available: number;
}

/**
 * Upload an API key into stock, auto-syncing (or creating) the matching package.
 * Transaction-safe and idempotent against duplicate keys (fingerprint UNIQUE).
 */
export async function uploadToken(input: UploadTokenInput): Promise<UploadResult> {
  const totalTokens = normalizeTokens(input.total_tokens);
  const apiKey = input.api_key.trim();
  const fp = fingerprint(apiKey);

  return withTransaction(async (client) => {
    // Prevent duplicate token insertion up front (clear error vs raw 23505).
    const dup = await client.query('SELECT id FROM tokens WHERE token_fingerprint = $1', [fp]);
    if (dup.rows[0]) throw conflict('This API key is already in stock');

    const { pkg, created } = await findOrCreatePackage(
      {
        totalTokens,
        validDays: input.valid_days,
        price: input.price,
        name: input.package_name,
        description: input.description,
      },
      client,
    );

    const immediate = input.start_mode === 'immediate';
    const status: TokenStatus = immediate ? 'active' : 'stock';

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tokens (
          package_id, base_url, token_value, token_fingerprint, token_last4,
          total_tokens, valid_days, price, start_mode, status,
          started_at, expires_at
       ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          ${immediate ? 'NOW()' : 'NULL'},
          ${immediate ? `NOW() + ($7 || ' days')::interval` : 'NULL'}
       )
       RETURNING id`,
      [
        pkg.id,
        input.base_url.trim(),
        encrypt(apiKey),
        fp,
        last4(apiKey),
        totalTokens.toString(),
        input.valid_days,
        input.price,
        input.start_mode,
        status,
      ],
    );

    const view = await getTokenView(rows[0].id, client);

    const stockRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tokens WHERE package_id = $1 AND status = 'stock'`,
      [pkg.id],
    );

    logger.info('api', `API added to stock: ${pkg.name} (${created ? 'new package' : 'existing package'})`);

    return {
      token: view,
      package: {
        id: pkg.id,
        name: pkg.name,
        total_tokens: pkg.total_tokens,
        created,
      },
      stock_available: Number(stockRes.rows[0].count),
    };
  });
}

export async function getTokenView(id: string, client?: Queryable): Promise<TokenView> {
  const q = client ?? db;
  const { rows } = await q.query<TokenViewRaw>(`${VIEW_SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw notFound('Token not found');
  return toView(rows[0]);
}

export interface ListTokensFilter {
  status?: TokenStatus;
  packageId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listTokens(filter: ListTokensFilter = {}): Promise<{
  items: TokenView[];
  total: number;
}> {
  const conds: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    params.push(filter.status);
    conds.push(`t.status = $${params.length}`);
  }
  if (filter.packageId) {
    params.push(filter.packageId);
    conds.push(`t.package_id = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conds.push(`(t.base_url ILIKE $${params.length} OR t.token_last4 ILIKE $${params.length})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tokens t ${where}`,
    params,
  );

  params.push(limit, offset);
  const { rows } = await query<TokenViewRaw>(
    `${VIEW_SELECT} ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items: rows.map(toView), total: Number(countRes.rows[0].count) };
}

/** Decrypt and return the full API key. MUST be audited by the caller. */
export async function revealKey(id: string): Promise<string> {
  const { rows } = await query<{ token_value: string }>(
    'SELECT token_value FROM tokens WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw notFound('Token not found');
  return decrypt(rows[0].token_value);
}

export async function setTokenStatus(id: string, status: 'stock' | 'disabled'): Promise<TokenView> {
  const { rows } = await query<{ id: string }>(
    `UPDATE tokens SET status = $1, updated_at = NOW()
     WHERE id = $2 AND status IN ('stock','disabled')
     RETURNING id`,
    [status, id],
  );
  if (!rows[0]) {
    throw conflict('Only tokens still in stock (or disabled) can be toggled this way');
  }
  return getTokenView(id);
}

export async function deleteToken(id: string): Promise<void> {
  // Only allow deleting unsold stock.
  const res = await query(
    `DELETE FROM tokens WHERE id = $1 AND status IN ('stock','disabled') AND is_used = FALSE`,
    [id],
  );
  if (res.rowCount === 0) {
    throw conflict('Only unsold stock can be deleted');
  }
}
