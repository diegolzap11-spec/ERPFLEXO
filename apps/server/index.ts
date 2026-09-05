// Vercel's native Hono framework support looks for a conventional entry file
// (index/app/server, at the project root or under src/) that exports a Hono
// app instance, and wraps it itself — that's what makes this file the
// PRIMARY deploy entrypoint (not apps/server/api/*).
//
// It re-exports from dist-vercel/index.js — the bundle `pnpm run
// build:vercel` produces (see package.json and vite.config.ts) — rather than
// importing _core/create-app.ts directly, because route auto-discovery in
// _core/route-registry.ts uses `import.meta.glob`, a Vite-only build-time
// macro. Vite (via the SERVER_BUILD_TARGET=vercel target, see
// vite.config.ts) resolves it into real static imports at build time; a raw
// TS import here would leave `import.meta.glob` unresolved under Vercel's
// own bundler. The Vercel project's Build Command runs `pnpm --filter server
// run build:vercel` before this file is read, so the bundle already exists
// by the time it's imported.
//
// This file is intentionally left out of tsconfig.json's `include` — it
// imports a build artifact that doesn't exist until the first build, so
// there is nothing for tsc to check it against.
import app from "./dist-vercel/index.js";

export default app;
