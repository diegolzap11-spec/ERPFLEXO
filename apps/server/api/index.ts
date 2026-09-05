// Vercel Serverless Function entry point.
//
// This file is intentionally named "index.ts" (a plain, unambiguous name —
// not the "[[...route]]" bracket-catch-all convention) because Vercel's
// zero-config Node.js Function discovery needs an exact, ordinary filename
// under api/ to reliably detect this as a function; the previous
// bracket-named file was not being picked up, which made Vercel fall back to
// its "single conventional server entrypoint" search (app.*/index.*/server.*
// at the project root) and fail with "No entrypoint found" even though the
// build itself succeeded.
//
// Vercel only invokes this function for requests that resolve to exactly
// /api (the "index" convention). Every other /api/* path is routed here via
// the catch-all rewrite in vercel.json ("/(.*)" -> "/api"), so the Hono app
// still sees the real incoming path and does its own internal routing from
// there (see _core/create-app.ts and _core/route-registry.ts) — nothing
// about the app's routes changes.
//
// dist-vercel/index.js is produced by `pnpm run build:vercel` (see
// package.json and vite.config.ts), which the Vercel project's Build Command
// runs before this function is bundled. It is a build artifact, not source,
// so this file is intentionally left out of tsconfig.json's `include` — tsc
// has nothing to type-check against before the first build.
import handler from "../dist-vercel/index.js";

export const config = { runtime: "nodejs" };

// IMPORTANT: on the Node.js runtime, Vercel calls a `default` export with the
// legacy (req, res) Node http signature, silently ignoring anything it
// returns — confirmed live via `vercel logs`, which showed every request
// timing out after 30s with "default export returned a `Response`... You
// likely meant the Web fetch-style API. Fix: export a `fetch` function."
// A named `fetch` export is Vercel's documented opt-in for the Web-standard
// (req: Request) => Response signature on the Node.js runtime (Edge
// functions get this for free via `default`, but better-auth needs
// node:crypto's scrypt/randomBytes, which Edge doesn't provide).
export function fetch(request: Request) {
  return handler(request);
}
