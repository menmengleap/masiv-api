import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { logger, type LogSource } from '../lib/logger.js';
import { listAuditLogs } from '../services/audit.service.js';

export const logsRouter = Router();

// System / bot / worker logs from the in-memory ring buffer.
logsRouter.get(
  '/system',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = q.limit ? Math.min(Number(q.limit), 500) : 200;
    const source = q.source as LogSource | undefined;
    res.json({ items: logger.recent(limit, source) });
  }),
);

// Persistent admin audit logs.
logsRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = q.limit ? Math.min(Number(q.limit), 200) : 100;
    const offset = q.offset ? Number(q.offset) : 0;
    res.json({ items: await listAuditLogs(limit, offset) });
  }),
);
