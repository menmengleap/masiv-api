import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { updatePoliciesSchema, updateSettingsSchema } from '../schemas.js';
import { audit } from '../services/audit.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { getPolicies, updatePolicies } from '../services/policy.service.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettings());
  }),
);

settingsRouter.put(
  '/',
  validate(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.body);
    await audit({
      adminId: req.admin!.id,
      action: 'settings.update',
      entityType: 'bot_settings',
      entityId: settings.id,
      // Never audit-log secrets verbatim; record which fields changed.
      metadata: { fields: Object.keys(req.body) },
    });
    res.json(settings);
  }),
);

export const policyRouter = Router();

policyRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getPolicies());
  }),
);

policyRouter.put(
  '/',
  validate(updatePoliciesSchema),
  asyncHandler(async (req, res) => {
    const policies = await updatePolicies(req.body);
    await audit({
      adminId: req.admin!.id,
      action: 'policies.update',
      entityType: 'service_policies',
      entityId: policies.id,
      metadata: { fields: Object.keys(req.body) },
    });
    res.json(policies);
  }),
);
