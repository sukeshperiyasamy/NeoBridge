import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL in apps/mobile/.env; a phone on
 * mobile data can't reach "localhost", so a demo APK needs the LAN or a public URL.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

const TOKEN_KEY = 'neobridge.token';
let token: string | null = null;
let tokenLoaded = false;
const unauthorisedListeners = new Set<() => void>();

export class ApiError extends Error {
  constructor(
    /** 0 = no network / server unreachable */
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`);
  }
  get offline() {
    return this.status === 0;
  }
}

export async function getToken(): Promise<string | null> {
  if (!tokenLoaded) {
    token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    tokenLoaded = true;
  }
  return token;
}

export async function setToken(value: string | null) {
  token = value;
  tokenLoaded = true;
  if (value) await AsyncStorage.setItem(TOKEN_KEY, value).catch(() => undefined);
  else await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

/** Called when the server says the session is gone (expired, or the demo server restarted). */
export function onUnauthorised(listener: () => void): () => void {
  unauthorisedListeners.add(listener);
  return () => unauthorisedListeners.delete(listener);
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const t = await getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(t ? { authorization: `Bearer ${t}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
  } catch {
    throw new ApiError(0, 'offline');
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && t) unauthorisedListeners.forEach((l) => l());
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? 'error'), json);
  return json as T;
}

/** An id the phone makes up, so a write replayed from the queue is recognised. */
export function clientId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
