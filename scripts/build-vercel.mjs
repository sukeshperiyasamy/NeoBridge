// Builds the NeoBridge site for Vercel (Build Output API v3) into .vercel/output:
//
//   static/            the mobile app's web build (same UI as the phone app)
//   functions/api.func the API (apps/api) bundled into one file
//   config.json        /v1/* and /health → the API; every other path → the app
//
// Deploy:  node scripts/build-vercel.mjs && npx vercel deploy --prebuilt --prod
// The API reads DATABASE_URL (Neon) from the Vercel project's environment.

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".vercel", "output");
// Vercel region for the API; keep it next to the Neon database.
const REGION = process.env.VERCEL_REGION ?? "sin1";

rmSync(out, { recursive: true, force: true });

// 1 · the app's web build. API_URL "/" means "this site", so the API is same-origin.
console.log("› web build (apps/mobile)");
execSync(`npx expo export --platform web --output-dir "${join(out, "static")}"`, {
  cwd: join(root, "apps", "mobile"),
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_API_URL: "/", NODE_ENV: "production" },
});

// 2 · the API, one ES module. db.ts reads ../db/schema.sql, so the bundle sits in src/.
console.log("› API bundle (apps/api)");
const func = join(out, "functions", "api.func");
mkdirSync(join(func, "src"), { recursive: true });
await build({
  entryPoints: [join(root, "apps", "api", "src", "vercel.ts")],
  outfile: join(func, "src", "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // PGlite is only for local runs without DATABASE_URL
  external: ["@electric-sql/pglite"],
  // some dependencies still call require()
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
cpSync(join(root, "apps", "api", "db"), join(func, "db"), { recursive: true });
writeFileSync(
  join(func, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "src/index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      maxDuration: 30,
      regions: [REGION],
    },
    null,
    2,
  ),
);
writeFileSync(join(func, "package.json"), JSON.stringify({ type: "module" }));

// 3 · routing
writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/(v1/.*|health)$", dest: "/api?__path=$1" },
        { handle: "filesystem" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log(`\n✓ .vercel/output ready (API region ${REGION})`);
