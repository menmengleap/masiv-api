import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { authRouter } from './auth.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { stockRouter } from './stock.routes.js';
import { packageRouter } from './package.routes.js';
import { orderRouter, paymentRouter } from './order.routes.js';
import { customerRouter } from './customer.routes.js';
import { settingsRouter, policyRouter } from './settings.routes.js';
import { logsRouter } from './logs.routes.js';
import { expiryRouter } from './expiry.routes.js';
import { telegramRouter } from './telegram.routes.js';
import { khqrRouter } from './khqr.routes.js';

export const apiRouter = Router();

// Public auth endpoints (login is rate-limited inside the router).
apiRouter.use('/auth', authRouter);

// Everything below requires an authenticated admin session.
apiRouter.use('/dashboard', requireAuth, dashboardRouter);
apiRouter.use('/stock', requireAuth, stockRouter);
apiRouter.use('/packages', requireAuth, packageRouter);
apiRouter.use('/orders', requireAuth, orderRouter);
apiRouter.use('/payments', requireAuth, paymentRouter);
apiRouter.use('/customers', requireAuth, customerRouter);
apiRouter.use('/settings', requireAuth, settingsRouter);
apiRouter.use('/policies', requireAuth, policyRouter);
apiRouter.use('/logs', requireAuth, logsRouter);
apiRouter.use('/expiry', requireAuth, expiryRouter);
apiRouter.use('/telegram', requireAuth, telegramRouter);
apiRouter.use('/khqr', requireAuth, khqrRouter);
