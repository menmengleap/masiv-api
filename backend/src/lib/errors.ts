/** Typed application error carrying an HTTP status + machine-readable code. */
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Forbidden') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') =>
  new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);

export const serverError = (message = 'Internal server error') =>
  new AppError(500, 'server_error', message);
