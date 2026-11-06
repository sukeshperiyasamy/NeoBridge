import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ApiError, api } from './client';

/**
 * Reads from the API, kept on the phone so screens still show the last thing
 * they saw when there is no internet. A screen calls useApi(path); writes call
 * invalidate(prefix) so the screens showing that data fetch it again.
 */

interface Entry {
  data: unknown;
  at: number;
}

const memory = new Map<string, Entry>();
const listeners = new Set<(prefix: string) => void>();
const CACHE_PREFIX = 'neobridge.cache.';

export function invalidate(prefix: string) {
  listeners.forEach((l) => l(prefix));
}

export async function clearCache() {
  memory.clear();
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(CACHE_PREFIX))).catch(() => undefined);
}

export interface ApiQuery<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** data is from the phone's copy, not fresh from the server */
  stale: boolean;
  /** when data was fetched */
  at: number | null;
  refresh: () => Promise<void>;
}

let onFetched: (() => void) | null = null;
/** Lets the outbox know a read worked (the server is reachable). */
export function setOnFetched(f: () => void) {
  onFetched = f;
}

export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}): ApiQuery<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean; stale: boolean; at: number | null }>(
    () => {
      const hit = path ? memory.get(path) : undefined;
      return { data: (hit?.data as T) ?? null, error: null, loading: !!path, stale: !!hit, at: hit?.at ?? null };
    },
  );
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    if (!memory.has(p)) {
      const saved = await AsyncStorage.getItem(CACHE_PREFIX + p).catch(() => null);
      if (saved && pathRef.current === p) {
        const entry = JSON.parse(saved) as Entry;
        memory.set(p, entry);
        setState((s) => (s.data ? s : { ...s, data: entry.data as T, stale: true, at: entry.at }));
      }
    }
    try {
      const data = await api<T>('GET', p);
      const entry = { data, at: Date.now() };
      memory.set(p, entry);
      void AsyncStorage.setItem(CACHE_PREFIX + p, JSON.stringify(entry)).catch(() => undefined);
      onFetched?.();
      if (pathRef.current === p) setState({ data, error: null, loading: false, stale: false, at: entry.at });
    } catch (e) {
      if (pathRef.current === p) setState((s) => ({ ...s, error: e as ApiError, loading: false, stale: s.data !== null }));
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    const hit = memory.get(path);
    setState({ data: (hit?.data as T) ?? null, error: null, loading: true, stale: !!hit, at: hit?.at ?? null });
    void load();
    const l = (prefix: string) => {
      if (path.startsWith(prefix)) void load();
    };
    listeners.add(l);
    // Polls only while the app is on screen: a phone in a pocket shouldn't keep
    // the server (and its database) busy. Coming back, it loads at once.
    const timer = opts.pollMs
      ? setInterval(() => {
          if (AppState.currentState === 'active') void load();
        }, opts.pollMs)
      : null;
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && opts.pollMs) void load();
    });
    return () => {
      listeners.delete(l);
      if (timer) clearInterval(timer);
      appState.remove();
    };
  }, [path, opts.pollMs, load]);

  return { ...state, refresh: load };
}

/** Subscribe React to any small external store with getState/subscribe. */
export function useStore<S>(store: { getState: () => S; subscribe: (l: () => void) => () => void }): S {
  return useSyncExternalStore(store.subscribe, store.getState);
}
