import { db, query, withTransaction, type Queryable } from '../db/pool.js';
import { conflict, notFound, badRequest } from '../lib/errors.js';
import { defaultPackageName, normalizeTokens } from '../lib/tokens.js';
import type { PackageRow } from '../types.js';

export interface PackageView extends PackageRow {
  stock_available: number;
  stock_total: number;
}

/** Find a package by exact normalized token amount. */
export async function findPackageByTokens(
  totalTokens: bigint,
  client?: Queryable,
): Promise<PackageRow | null> {
  const q = client ?? db;
  const { rows } = await q.query<PackageRow>(
    'SELECT * FROM packages WHERE total_tokens = $1 LIMIT 1',
    [totalTokens.toString()],
  );
  return rows[0] ?? null;
}

/**
 * Auto package sync: find the package matching this token amount, or create it.
 * Returns the package plus whether it was newly created.
 *
 * Used by the API upload flow — admin never has to pre-create packages or edit
 * source code to introduce a new size (750M, 2B, 5B, 20B, …).
 */
export async function findOrCreatePackage(
  params: {
    totalTokens: bigint;
    validDays: number;
    price: number;
    name?: string;
    description?: string | null;
  },
  client?: Queryable,
): Promise<{ pkg: PackageRow; created: boolean }> {
  const q = client ?? db;
  const existing = await findPackageByTokens(params.totalTokens, q);
  if (existing) return { pkg: existing, created: false };

  const name = (params.name?.trim() || defaultPackageName(params.totalTokens)).slice(0, 120);

  // Insert; on race, fall back to the existing row.
  const { rows } = await q.query<PackageRow>(
    `INSERT INTO packages (name, total_tokens, price, default_valid_days, description, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (total_tokens) DO NOTHING
     RETURNING *`,
    [
      name,
      params.totalTokens.toString(),
      params.price,
      params.validDays,
      params.description ?? null,
      // Sort ascending by token amount by default (bigints won't fit int; clamp).
      Number(params.totalTokens > 2_000_000_000n ? 2_000_000_000n : params.totalTokens),
    ],
  );

  if (rows[0]) return { pkg: rows[0], created: true };

  // Name collided or race — re-fetch by token amount.
  const fallback = await findPackageByTokens(params.totalTokens, q);
  if (fallback) return { pkg: fallback, created: false };

  // Name unique collision with a different token amount.
  throw conflict(`A package named "${name}" already exists with a different token amount`);
}

export async function listPackages(opts?: { activeOnly?: boolean }): Promise<PackageView[]> {
  const where = opts?.activeOnly ? 'WHERE p.is_active = TRUE' : '';
  const { rows } = await query<PackageView>(
    `SELECT p.*,
        COALESCE(s.stock_available, 0)::int AS stock_available,
        COALESCE(s.stock_total, 0)::int AS stock_total
     FROM packages p
     LEFT JOIN (
        SELECT package_id,
               COUNT(*) FILTER (WHERE status = 'stock') AS stock_available,
               COUNT(*) AS stock_total
        FROM tokens
        GROUP BY package_id
     ) s ON s.package_id = p.id
     ${where}
     ORDER BY p.sort_order ASC, p.total_tokens ASC`,
  );
  return rows;
}

export async function getPackage(id: string): Promise<PackageView> {
  const rows = await listPackages();
  const pkg = rows.find((p) => p.id === id);
  if (!pkg) throw notFound('Package not found');
  return pkg;
}

export interface CreatePackageInput {
  name: string;
  total_tokens: string | number;
  price: number;
  default_valid_days: number;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export async function createPackage(input: CreatePackageInput): Promise<PackageRow> {
  const tokens = normalizeTokens(input.total_tokens);
  return withTransaction(async (client) => {
    const existing = await findPackageByTokens(tokens, client);
    if (existing) {
      throw conflict(`A package for ${tokens.toString()} tokens already exists (${existing.name})`);
    }
    const { rows } = await client.query<PackageRow>(
      `INSERT INTO packages (name, total_tokens, price, default_valid_days, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.name.trim(),
        tokens.toString(),
        input.price,
        input.default_valid_days,
        input.description ?? null,
        input.is_active ?? true,
        input.sort_order ?? 0,
      ],
    );
    return rows[0];
  });
}

export interface UpdatePackageInput {
  name?: string;
  price?: number;
  default_valid_days?: number;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export async function updatePackage(id: string, input: UpdatePackageInput): Promise<PackageRow> {
  const { rows: existingRows } = await query<PackageRow>(
    'SELECT * FROM packages WHERE id = $1',
    [id],
  );
  const current = existingRows[0];
  if (!current) throw notFound('Package not found');

  const merged = {
    name: input.name?.trim() ?? current.name,
    price: input.price ?? Number(current.price),
    default_valid_days: input.default_valid_days ?? current.default_valid_days,
    description: input.description === undefined ? current.description : input.description,
    is_active: input.is_active ?? current.is_active,
    sort_order: input.sort_order ?? current.sort_order,
  };

  const { rows } = await query<PackageRow>(
    `UPDATE packages SET
        name = $1, price = $2, default_valid_days = $3,
        description = $4, is_active = $5, sort_order = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      merged.name,
      merged.price,
      merged.default_valid_days,
      merged.description,
      merged.is_active,
      merged.sort_order,
      id,
    ],
  );
  return rows[0];
}

export async function deletePackage(id: string): Promise<void> {
  const { rows: pkgRows } = await query<PackageRow>('SELECT id, name FROM packages WHERE id = $1', [id]);
  if (!pkgRows[0]) throw notFound('Package not found');

  const { rows: orderRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders WHERE package_id = $1`,
    [id],
  );
  if (Number(orderRows[0].count) > 0) {
    throw badRequest('Cannot delete a package with existing orders. Deactivate it instead.');
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM tokens WHERE package_id = $1 AND is_used = FALSE', [id]);
    await client.query('DELETE FROM packages WHERE id = $1', [id]);
  });
}
