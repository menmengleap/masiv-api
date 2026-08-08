import { useApi } from '../hooks/useApi';

interface Health {
  status: string;
  uptime?: number;
}

const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Polls the backend /health endpoint every 30s to drive the "system online"
 * indicator in the top bar.
 */
export function useHealth() {
  return useApi<Health>(
    async (signal) => {
      const res = await fetch(`${BASE}/health`, { signal, credentials: 'include' });
      if (!res.ok) throw new Error('offline');
      return (await res.json()) as Health;
    },
    [],
    { pollMs: 30_000 },
  );
}
