import { Router } from 'express';
import { config } from '../config/index.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/ratelimit.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema } from '../schemas.js';
import {
  changePassword,
  getAdminById,
  issueToken,
  verifyCredentials,
} from '../services/auth.service.js';
import { audit } from '../services/audit.service.js';

export const authRouter = Router();

const cookieOpts = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax' as const,
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
};

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const admin = await verifyCredentials(username, password);
    const token = issueToken(admin);
    await audit({ adminId: admin.id, action: 'admin.login', entityType: 'admin', entityId: admin.id });
    res
      .cookie(config.cookieName, token, cookieOpts)
      .json({ admin, token });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie(config.cookieName, { ...cookieOpts, maxAge: undefined }).json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const admin = await getAdminById(req.admin!.id);
    if (!admin) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Session invalid' } });
      return;
    }
    res.json({ admin });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await changePassword(req.admin!.id, req.body.current_password, req.body.new_password);
    await audit({ adminId: req.admin!.id, action: 'admin.change_password' });
    res.json({ ok: true });
  }),
);
