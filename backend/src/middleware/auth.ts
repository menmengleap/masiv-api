import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';
import { unauthorized } from '../lib/errors.js';
import { verifyToken, type AuthedAdmin } from '../services/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

/** Require a valid admin session (JWT in HTTP-only cookie, or Bearer header). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[config.cookieName];
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = cookieToken || bearer;
  if (!token) {
    next(unauthorized('Not authenticated'));
    return;
  }
  req.admin = verifyToken(token);
  next();
}
