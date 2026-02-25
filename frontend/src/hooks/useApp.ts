import { useState, useEffect } from 'react';
import { api, type AppRecord } from '../lib/api';

export function useApp(id: string | undefined, byShortId = false) {
  const [app, setApp] = useState<AppRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const fetch = byShortId ? api.getByShortId(id) : api.getApp(id);
    fetch
      .then((data) => setApp(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load app'))
      .finally(() => setLoading(false));
  }, [id, byShortId]);

  return { app, loading, error };
}
