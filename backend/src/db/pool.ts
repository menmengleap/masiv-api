import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

/**
 * Keep BIGINT (oid 20) and NUMERIC (oid 1700) as strings.
 * - BIGINT: token counts can be huge; strings avoid precision loss in JSON.
 * - NUMERIC: money — never use float. Services convert with care.
 * (pg already returns NUMERIC as string by default; BIGINT too. This is
 *  explicit for clarity and safety.)
 */
pg.types.setTypeParser(20, (v) => v); // bigint -> string
pg.types.setTypeParser(1700, (v) => v); // numeric -> string

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('db', `Unexpected idle client error: ${err.message}`);
});

export type QueryParams = ReadonlyArray<unknown>;

/**
 * Minimal query interface satisfied by both the pool wrapper and a PoolClient.
 * Services accept this so the same code runs standalone or inside a transaction.
 */
export interface Queryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: QueryParams,
  ): Promise<pg.QueryResult<T>>;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: QueryParams,
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] | undefined);
}

/** A Queryable backed by the pool (for default, non-transactional calls). */
export const db: Queryable = { query };

/**
 * Run `fn` inside a transaction. Commits on success, rolls back on any throw.
 * The provided client MUST be used for all queries inside `fn`.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('db', `Rollback failed: ${(rollbackErr as Error).message}`);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
