import { useEffect, useReducer } from 'react';
import { api, type AppRecord } from '../lib/api';

interface AppState {
  app: AppRecord | null;
  loading: boolean;
  error: string | null;
}

type AppAction =
  | { type: 'start' }
  | { type: 'success'; app: AppRecord }
  | { type: 'error'; message: string };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'start':
      return { app: null, loading: true, error: null };
    case 'success':
      return { app: action.app, loading: false, error: null };
    case 'error':
      return { app: null, loading: false, error: action.message };
    default:
      return state;
  }
}

export function useApp(id: string | undefined, byShortId = false) {
  const [state, dispatch] = useReducer(reducer, {
    app: null,
    loading: Boolean(id),
    error: null,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    dispatch({ type: 'start' });
    const fetch = byShortId ? api.getByShortId(id) : api.getApp(id);
    fetch
      .then((data) => {
        if (!cancelled) dispatch({ type: 'success', app: data });
      })
      .catch((err) => {
        if (!cancelled) {
          dispatch({
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to load app',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, byShortId]);

  return state;
}
