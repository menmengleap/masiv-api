import { db, query, type Queryable } from '../db/pool.js';

/**
 * Append an audit log entry for an admin action.
 * Pass a transaction client to keep the log atomic with the action.
 */
export async function audit(
  params: {
    adminId: string | null;
    action: string;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
  client?: Queryable,
): Promise<void> {
  const q = client ?? db;
  await q.query(
    `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.adminId,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  );
}

export interface AuditLogView {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function listAuditLogs(limit = 100, offset = 0): Promise<AuditLogView[]> {
  const { rows } = await query<AuditLogView>(
    `SELECT a.id::text, a.admin_id, ad.username AS admin_username,
            a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
     FROM audit_logs a
     LEFT JOIN admins ad ON ad.id = a.admin_id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}
