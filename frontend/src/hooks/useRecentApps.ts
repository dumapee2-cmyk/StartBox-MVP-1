import { useState, useEffect } from 'react';
import { api, type RecentApp } from '../lib/api';

export function useRecentApps() {
  const [apps, setApps] = useState<RecentApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getRecent()
      .then((data) => {
        if (!cancelled) {
          setApps(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load apps');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { apps, loading, error };
}
