import { useState } from 'react';
import { api, type GenerateResult } from '../lib/api';

export function useGenerate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(prompt: string): Promise<GenerateResult | null> {
    setLoading(true);
    setError(null);
    try {
      const result = await api.generate(prompt);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { generate, loading, error };
}
