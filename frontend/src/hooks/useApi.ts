import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the very first load; false during background refetches. */
  initialLoading: boolean;
  refetch: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Fetch-on-mount hook with abort handling, manual refetch, and optional polling.
 * `fetcher` must be stable (wrap in useCallback) or listed via `deps`.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  opts: { pollMs?: number } = {},
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    let active = true;
    setLoading(true);
    fetcher(ctrl.signal)
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
        loadedOnce.current = true;
      })
      .catch((err) => {
        if (!active || ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof ApiError ? err.message : (err as Error).message;
        setError(message || 'Failed to load');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  // Optional polling
  useEffect(() => {
    if (!opts.pollMs) return;
    const id = window.setInterval(refetch, opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts.pollMs, refetch]);

  return {
    data,
    error,
    loading,
    initialLoading: loading && !loadedOnce.current,
    refetch,
    setData,
  };
}
