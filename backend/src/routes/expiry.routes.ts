import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { paginationSchema } from '../schemas.js';
import { listTokens } from '../services/token.service.js';
import { getWorkerStatus, restartExpiryWorker, runExpiryPass } from '../worker/expiry.worker.js';
import { audit } from '../services/audit.service.js';

export const expiryRouter = Router();

// Tokens grouped for the Expiry page (active / expiring / expired).
expiryRouter.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = q.limit ? Number(q.limit) : 200;
    const [expiring, expired, active] = await Promise.all([
      listTokens({ status: 'expiring', limit }),
      listTokens({ status: 'expired', limit }),
      listTokens({ status: 'active', limit }),
    ]);
    res.json({
      worker: getWorkerStatus(),
      expiring: expiring.items,
      expired: expired.items,
      active: active.items,
    });
  }),
);

// Force an immediate expiry pass.
expiryRouter.post(
  '/run',
  asyncHandler(async (req, res) => {
    const result = await runExpiryPass();
    await audit({ adminId: req.admin!.id, action: 'worker.run_expiry', metadata: result });
    res.json({ ok: true, result, worker: getWorkerStatus() });
  }),
);

// Restart the worker loop.
expiryRouter.post(
  '/restart-worker',
  asyncHandler(async (req, res) => {
    restartExpiryWorker();
    await audit({ adminId: req.admin!.id, action: 'worker.restart' });
    res.json({ ok: true, worker: getWorkerStatus() });
  }),
);
