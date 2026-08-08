/**
 * Thin API client. All requests are same-origin in dev (Vite proxy) and use
 * `credentials: 'include'` so the HTTP-only session cookie flows automatically.
 * No tokens are ever stored in JS — auth state lives entirely in the cookie.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: Options['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = opts;
  const res = await fetch(buildUrl(path, query), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // 204 / empty
  const text = await res.text();
  const data = text ? safeParse(text) : undefined;

  if (!res.ok) {
    // Backend error shape: { error: { code, message, details } }.
    const payload = (data ?? {}) as {
      error?: { code?: string; message?: string; details?: unknown } | string;
      message?: string;
    };
    const err = typeof payload.error === 'object' ? payload.error : undefined;
    const message =
      err?.message ||
      (typeof payload.error === 'string' ? payload.error : undefined) ||
      payload.message ||
      res.statusText ||
      'Request failed';
    throw new ApiError(res.status, message, err?.code, err?.details);
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export const api = {
  get: <T>(path: string, query?: Options['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body, signal }),
  del: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'DELETE', body, signal }),
};
