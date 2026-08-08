import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Wrap an async route handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

// Express error middleware requires the 4-arg signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('api', `${req.method} ${req.path} → ${err.message}`);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Postgres unique violation etc. → surface a clean 409 where obvious.
  const pgCode = (err as { code?: string }).code;
  if (pgCode === '23505') {
    res.status(409).json({ error: { code: 'conflict', message: 'Duplicate value' } });
    return;
  }

  logger.error('api', `Unhandled error on ${req.method} ${req.path}: ${(err as Error).message}`);
  res.status(500).json({ error: { code: 'server_error', message: 'Internal server error' } });
}
