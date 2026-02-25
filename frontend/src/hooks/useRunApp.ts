import { useState } from 'react';
import { api, type RunResult } from '../lib/api';

export function useRunApp(appId: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(inputs: Record<string, string>, navId?: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.runApp(appId, inputs, navId);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setLoading(false);
    }
  }

  function clearResult() {
    setResult(null);
    setError(null);
  }

  return { run, result, loading, error, clearResult };
}
