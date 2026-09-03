// Vercel Serverless Function entry point. The "[[...route]]" catch-all name
// makes Vercel route every request under /api/* (and bare /api) to this one
// function; the Hono app inside dist-vercel/index.js does its own internal
// routing from there (it already expects the full /api/<name> path — see
// _core/create-app.ts and _core/route-registry.ts).
//
// dist-vercel/index.js is produced by `pnpm run build:vercel` (see
// package.json and vite.config.ts), which the Vercel project's Build Command
// runs before this function is bundled. It is a build artifact, not source,
// so this file is intentionally left out of tsconfig.json's `include` —
// tsc has nothing to type-check against before the first build.
import handler from "../dist-vercel/index.js";

export const config = { runtime: "nodejs" };

export default handler;
