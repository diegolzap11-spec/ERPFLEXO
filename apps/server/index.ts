// Vercel's native Hono framework support looks for a conventional entry file
// (index/app/server, at the project root or under src/) — but it doesn't
// just check the exported value's shape: it statically scans the entry
// file's own source for a literal `import ... from "hono"` before accepting
// it (confirmed live: it rejected an earlier version of this file with
// "No entrypoint found which imports hono. Found possible entrypoint:
// index.ts", even though its default export genuinely was a Hono instance).
// The side-effect import below exists ONLY to satisfy that source scan.
import "hono";

// The actual app comes from dist-vercel/index.js — the bundle `pnpm run
// build:vercel` produces (see package.json and vite.config.ts) — rather than
// from importing _core/create-app.ts directly, because route auto-discovery
// in _core/route-registry.ts uses `import.meta.glob`, a Vite-only
// build-time macro. Vite (via the SERVER_BUILD_TARGET=vercel target, see
// vite.config.ts) resolves it into real static imports at build time and
// inlines the "hono" package itself (ssr.noExternal), which is exactly why
// the plain `import "hono"` above is needed: nothing in the bundled output
// re-imports it from the bare package anymore. The Vercel project's Build
// Command runs `pnpm --filter server run build:vercel` before this file is
// read, so the bundle already exists by the time it's imported.
//
// This file is intentionally left out of tsconfig.json's `include` — it
// imports a build artifact that doesn't exist until the first build, so
// there is nothing for tsc to check it against.
import app from "./dist-vercel/index.js";

export default app;
