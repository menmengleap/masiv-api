import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { idParamSchema, paginationSchema, uploadTokenSchema } from '../schemas.js';
import { audit } from '../services/audit.service.js';
import {
  deleteToken,
  listTokens,
  revealKey,
  setTokenStatus,
  uploadToken,
  type ListTokensFilter,
} from '../services/token.service.js';
import type { TokenStatus } from '../types.js';

export const stockRouter = Router();

// List API stock (keys masked).
stockRouter.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: ListTokensFilter = {
      status: q.status as TokenStatus | undefined,
      packageId: q.package_id,
      search: q.search,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    };
    res.json(await listTokens(filter));
  }),
);

// Upload a new API key → auto package sync + stock insert.
stockRouter.post(
  '/upload',
  validate(uploadTokenSchema),
  asyncHandler(async (req, res) => {
    const result = await uploadToken(req.body);
    await audit({
      adminId: req.admin!.id,
      action: 'token.upload',
      entityType: 'token',
      entityId: result.token.id,
      metadata: {
        package: result.package.name,
        package_created: result.package.created,
        total_tokens: result.token.total_tokens,
        start_mode: result.token.start_mode,
      },
    });
    res.status(201).json(result);
  }),
);

// Reveal the full API key (audited).
stockRouter.post(
  '/:id/reveal',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const key = await revealKey(req.params.id);
    await audit({
      adminId: req.admin!.id,
      action: 'token.reveal',
      entityType: 'token',
      entityId: req.params.id,
    });
    res.json({ api_key: key });
  }),
);

// Disable / re-enable a stock token.
stockRouter.post(
  '/:id/disable',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const token = await setTokenStatus(req.params.id, 'disabled');
    await audit({ adminId: req.admin!.id, action: 'token.disable', entityType: 'token', entityId: req.params.id });
    res.json(token);
  }),
);

stockRouter.post(
  '/:id/enable',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const token = await setTokenStatus(req.params.id, 'stock');
    await audit({ adminId: req.admin!.id, action: 'token.enable', entityType: 'token', entityId: req.params.id });
    res.json(token);
  }),
);

stockRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await deleteToken(req.params.id);
    await audit({ adminId: req.admin!.id, action: 'token.delete', entityType: 'token', entityId: req.params.id });
    res.json({ ok: true });
  }),
);
