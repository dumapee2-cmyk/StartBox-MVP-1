import { useEffect, useReducer } from 'react';
import { api, type RecentApp } from '../lib/api';

interface RecentAppsState {
  apps: RecentApp[];
  loading: boolean;
  error: string | null;
}

type RecentAppsAction =
  | { type: 'start' }
  | { type: 'success'; apps: RecentApp[] }
  | { type: 'error'; message: string };

function reducer(state: RecentAppsState, action: RecentAppsAction): RecentAppsState {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true, error: null };
    case 'success':
      return { apps: action.apps, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}

export function useRecentApps() {
  const [state, dispatch] = useReducer(reducer, {
    apps: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'start' });
    api.getRecent()
      .then((data) => {
        if (!cancelled) {
          dispatch({ type: 'success', apps: data });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          dispatch({ type: 'error', message: err.message ?? 'Failed to load apps' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
