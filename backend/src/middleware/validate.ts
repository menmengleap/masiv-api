import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { badRequest } from '../lib/errors.js';

type Part = 'body' | 'query' | 'params';

/**
 * Validate a request part against a Zod schema and replace it with the parsed
 * (typed, coerced) value. On failure throws a 400 with field details.
 */
export function validate(schema: ZodSchema, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      // query/params are read-only getters in Express 5; assign defensively.
      (req as unknown as Record<Part, unknown>)[part] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          badRequest(
            'Validation failed',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}
