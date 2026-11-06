import type { Context, MiddlewareHandler } from "hono";

/**
 * Request limits, to keep the database inside Neon's free plan and stop
 * brute-force logins. Fixed one-minute windows, counted in memory per server
 * instance (no database writes: counting in Postgres would wake it up, which
 * is what this is here to avoid). On Vercel each instance counts on its own,
 * so a client may get a little more than the limit; that's fine for this.
 *
 * Keys: the bearer token when there is one (one phone), otherwise the client
 * IP. Over the limit: 429 with Retry-After, and the phone tries again later.
 */

export interface Limit {
  /** requests allowed per minute */
  perMinute: number;
}

export interface RateLimits {
  /** login and OTP: each OTP is an SMS, and passwords can be guessed */
  auth: Limit;
  /** band readings from phones (they batch, so few calls) */
  upload: Limit;
  /** everything else */
  other: Limit;
}

export const defaultLimits: RateLimits = {
  auth: { perMinute: 10 },
  upload: { perMinute: 12 },
  other: { perMinute: 120 },
};

const WINDOW_MS = 60_000;
const MAX_KEYS = 20_000;

function clientKey(c: Context): string {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return `t:${auth.slice(7, 40)}`;
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded || c.req.header("x-real-ip") || "local"}`;
}

function kindOf(method: string, path: string): keyof RateLimits {
  if (path.startsWith("/v1/auth/")) return "auth";
  if (method === "POST" && /^\/v1\/bands\/[^/]+\/summaries$/.test(path)) return "upload";
  return "other";
}

export function rateLimit(limits: RateLimits = defaultLimits, now: () => number = Date.now): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();

  return async (c, next) => {
    if (c.req.method === "OPTIONS" || c.req.path === "/health") return next();
    const kind = kindOf(c.req.method, c.req.path);
    const key = `${kind}|${clientKey(c)}`;
    const t = now();

    let w = windows.get(key);
    if (!w || t - w.start >= WINDOW_MS) {
      if (windows.size >= MAX_KEYS) {
        // drop finished windows; if that frees nothing, start over
        for (const [k, v] of windows) if (t - v.start >= WINDOW_MS) windows.delete(k);
        if (windows.size >= MAX_KEYS) windows.clear();
      }
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;

    const limit = limits[kind].perMinute;
    if (w.count > limit) {
      const retryInSeconds = Math.max(1, Math.ceil((w.start + WINDOW_MS - t) / 1000));
      c.header("Retry-After", String(retryInSeconds));
      return c.json({ error: "rate_limited", retryInSeconds }, 429);
    }
    return next();
  };
}
