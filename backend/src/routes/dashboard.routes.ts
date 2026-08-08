import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { getDashboardStats } from '../services/stats.service.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await getDashboardStats());
  }),
);
