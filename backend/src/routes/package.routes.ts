import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { createPackageSchema, idParamSchema, updatePackageSchema } from '../schemas.js';
import { audit } from '../services/audit.service.js';
import {
  createPackage,
  deletePackage,
  getPackage,
  listPackages,
  updatePackage,
} from '../services/package.service.js';

export const packageRouter = Router();

packageRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active === 'true';
    res.json(await listPackages({ activeOnly }));
  }),
);

packageRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await getPackage(req.params.id));
  }),
);

packageRouter.post(
  '/',
  validate(createPackageSchema),
  asyncHandler(async (req, res) => {
    const pkg = await createPackage(req.body);
    await audit({
      adminId: req.admin!.id,
      action: 'package.create',
      entityType: 'package',
      entityId: pkg.id,
      metadata: { name: pkg.name, total_tokens: pkg.total_tokens },
    });
    res.status(201).json(pkg);
  }),
);

packageRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updatePackageSchema),
  asyncHandler(async (req, res) => {
    const pkg = await updatePackage(req.params.id, req.body);
    await audit({
      adminId: req.admin!.id,
      action: 'package.update',
      entityType: 'package',
      entityId: pkg.id,
      metadata: req.body,
    });
    res.json(pkg);
  }),
);

packageRouter.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await deletePackage(req.params.id);
    await audit({ adminId: req.admin!.id, action: 'package.delete', entityType: 'package', entityId: req.params.id });
    res.json({ ok: true });
  }),
);
