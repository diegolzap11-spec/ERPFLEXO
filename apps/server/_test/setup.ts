// Vitest global setup for the server test suite. Runs once per test file
// (worker) before any test code, including before the test file imports the
// Hono app. Two things must happen here, in order:
//
//   1. Redirect `@libsql/client/web` to the node variant of `@libsql/client`.
//      The web client only supports HTTP / libsql:// URLs; the node client
//      adds :memory: and file:// scheme support. Both expose the same
//      createClient/Client API surface so the rest of _core/db.ts works
//      unchanged.
//
//   2. Set the env vars _core/env.ts reads at module load. Without these
//      isDatabaseConfigured() returns false and every /api/auth/* request
//      short-circuits with 503 DATABASE_UNCONFIGURED.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

vi.mock("@libsql/client/web", async () => {
  return await import("@libsql/client");
});

// Route auto-discovery can instantiate the DB module more than once under
// Vitest. A process-scoped file lets every client in the same worker share the
// exact database, unlike :memory: where each client receives an isolated DB.
// Built from os.tmpdir() (not a hardcoded "/tmp") so this also works on
// Windows dev machines, where "/tmp" isn't a real path.
const TEST_DB_PATH = join(tmpdir(), `flexoimpress-erp-test-${process.pid}.sqlite`).replace(/\\/g, "/");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

// Use ??= so an external runner can override (e.g. point at a Docker
// libsql-server for the Phase 0 local-vs-production comparison experiment).
process.env.SKYBASE_DB_ENDPOINT ??= TEST_DB_URL;
process.env.SKYBASE_DB_TOKEN ??= "test-token";
process.env.SKYBASE_DB_NAMESPACE ??= "test-ns";
process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-32-chars-or-more-fixed";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001/api/auth";
process.env.ALLOWED_ORIGINS ??= "http://localhost:3000";
