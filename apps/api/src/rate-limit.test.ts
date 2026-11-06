import { test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { rateLimit } from "./rate-limit.ts";

function appWith(limits: Parameters<typeof rateLimit>[0], clock: { t: number }) {
  const app = new Hono();
  app.use("*", rateLimit(limits, () => clock.t));
  app.all("*", (c) => c.json({ ok: true }));
  return app;
}

const limits = { auth: { perMinute: 2 }, upload: { perMinute: 3 }, other: { perMinute: 5 } };

test("blocks logins over the limit per IP, then lets them through next minute", async () => {
  const clock = { t: 1_000_000 };
  const app = appWith(limits, clock);
  const login = () =>
    app.request("/v1/auth/password", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } });

  assert.equal((await login()).status, 200);
  assert.equal((await login()).status, 200);
  const blocked = await login();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(((await blocked.json()) as { error: string }).error, "rate_limited");

  // another IP is not affected
  const other = await app.request("/v1/auth/password", { method: "POST", headers: { "x-forwarded-for": "5.6.7.8" } });
  assert.equal(other.status, 200);

  clock.t += 60_000;
  assert.equal((await login()).status, 200);
});

test("counts each phone (token) separately and each kind of request separately", async () => {
  const clock = { t: 0 };
  const app = appWith(limits, clock);
  const upload = (token: string) =>
    app.request("/v1/bands/serial:AA/summaries", { method: "POST", headers: { authorization: `Bearer ${token}` } });

  for (let i = 0; i < 3; i++) assert.equal((await upload("phone-a")).status, 200);
  assert.equal((await upload("phone-a")).status, 429);
  assert.equal((await upload("phone-b")).status, 200);
  // reads have their own budget
  assert.equal((await app.request("/v1/babies", { headers: { authorization: "Bearer phone-a" } })).status, 200);
});

test("never limits /health or CORS preflights", async () => {
  const clock = { t: 0 };
  const app = appWith({ auth: { perMinute: 0 }, upload: { perMinute: 0 }, other: { perMinute: 0 } }, clock);
  assert.equal((await app.request("/health")).status, 200);
  assert.equal((await app.request("/v1/babies", { method: "OPTIONS" })).status, 200);
  assert.equal((await app.request("/v1/babies")).status, 429);
});
