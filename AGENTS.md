<!-- scaffold-contract: v2 -->
# Agent Guide (Scaffold Contract)

Full-stack web app template. This file is the complete scaffold contract: everything
needed to add features WITHOUT reading scaffold source files. Read a scaffold file
only when you must deviate from it or debug the scaffold itself. Keep this file
factual and aligned with implemented code.

## Stack

- Package manager: `pnpm` (workspaces: `apps/*`, `packages/*`)
- Client: `apps/client` — React 19, Vite/Rolldown, Tailwind CSS v4, shadcn/ui,
  react-router (`BrowserRouter`), TanStack Query
- Server: `apps/server` — Hono, Better Auth, Drizzle ORM, libsql (SQLite dialect)
- Shared: `packages/shared` — API response helpers (`@repo/shared/http`)

## Project Map

- Pages: `apps/client/src/pages/` (auth / home / not-found ship with the scaffold)
- Client helpers: `apps/client/src/lib/` (api.ts, api-base.ts, api-error.ts, auth.ts, utils.ts)
- UI components: `apps/client/src/components/ui/` (shadcn — use as-is, do not modify)
- Server core: `apps/server/_core/` (create-app.ts, route-registry.ts, auth.ts, db.ts, env.ts — reuse, do not rewrite)
- Middleware: `apps/server/middlewares/` (with-session, not-found, on-error)
- Routes: `apps/server/routes/` (one `<name>.route.ts` per feature — auto-mounted, see below)
- Services: `apps/server/services/` (business/data logic used by routes; s3_storage.ts and message.ts are scaffold-provided)
- Drizzle schema: `apps/server/db/schema.ts`
- Migrations: `apps/server/migrations/` (numbered `.sql`, applied by platform tooling, NOT by the app runtime)
- Scaffold-owned tests: `apps/server/_test/` (do NOT modify); your feature tests: `apps/server/__tests__/`

## Hard Boundaries

- Browser-facing APIs must be product/business APIs under `/api/*`. Never expose
  `/api/sql`, `/api/db/*`, or raw database/proxy routes.
- Frontend business code calls the backend ONLY through `apiFetch` from `@/lib/api`.
  Never call `fetch` / `axios` / `XMLHttpRequest` directly outside `lib/api.ts`.
- Only `_core/db.ts` may create libsql/Drizzle clients or read `SKYBASE_DB_*` env.
- Better Auth stays mounted at `/api/auth/*`; never reimplement auth endpoints or
  token storage.
- Google sign-in goes through the pre-wired third-party gateway flow ONLY:
  `startThirdPartyGoogleAuth()` from `@/lib/api` on the client, backed by
  `/api/third-party-google-auth/*` (see
  `apps/client/examples/third-party-google-auth-example/`). NEVER ask the user
  for Google Cloud OAuth credentials and never wire Better Auth
  `socialProviders` for a deployed site: the client site and this API are on
  different registrable domains, so the OAuth state cookie is dropped on
  Google's redirect back and every login fails with `state_mismatch`.
- Frontend public env must use `VITE_`. Never put secrets in frontend env or browser code.
- New server env reads go through `_core/env.ts` (add a field there) — EXCEPT
  platform-injected secrets (`STRIPE_*`, `SKYWORK_*` beyond those already in env.ts),
  which server-only code reads directly as `process.env.X`.
- Do not break `apps/client/src/main.tsx` bootstrap: it awaits `syncAuthTokenFromUrl()`
  and hydrates prerendered markup (`scripts/prerender.mjs` bakes the home page for
  crawlers). Keep the home page's first render SSR-safe: no `window` / `document` /
  `localStorage` access during render — put it in `useEffect`.

## Route Auto-Discovery (how endpoints exist)

Every `apps/server/routes/<name>.route.ts` is discovered by `_core/route-registry.ts`
and mounted at `/api/<name>` automatically. To add an endpoint, add a route file —
do NOT edit `create-app.ts` or `with-session.ts`.

- Export the Hono router under any name (or `default`); the first Hono-shaped export is used.
- `export const isPublic = true` opts the whole `/api/<name>` prefix out of session
  lookup (e.g. health.route.ts does this). Business routes should usually stay
  non-public and choose `publicRoute`, `protectedRoute`, or `adminRoute` per handler.
- Mount order is alphabetical by file name; `/api/auth/*` is always public (Better Auth).

## API Surface (signatures you build on)

> **Authoritative.** The signatures below are the contract — do not open the
> source files to "check", "confirm", or "see an example" of them. Use them as
> written; the Exemplar section shows the calling pattern. Read a source file
> only if a signature here is demonstrably wrong AND you have already tried to
> use it as written.

Server:

- `_core/db.ts` — `getDb()` → Drizzle instance over `db/schema.ts`;
  `executeSql(sql, args?)` for raw SQL (`?` placeholders); `isDatabaseConfigured()`;
  `checkDatabaseHealth()`; `class DatabaseError { code: "DATABASE_UNCONFIGURED" |
  "DATABASE_QUERY_FAILED"; status }`. (Storage-file and third-party-user helpers in
  this file serve the scaffold's own services — you rarely call them directly.)
- `_core/auth.ts` — `getAuth()` (Better Auth: emailAndPassword + bearer + username
  plugins); `type AuthUser = { id; name; email; emailVerified; role: "user" | "admin"; username? }`.
- `middlewares/with-session.ts` — the `withSession` middleware, pre-applied to
  `/api/*`; populates `c.var.user: AuthUser | null` and `c.var.session`.
  Custom user fields used for authorization (`role`, `emailVerified`, `username`)
  are hydrated from the DB `user` table after Better Auth identifies the session;
  do not rely on Better Auth's session payload alone for admin permissions.
- `_core/route-helpers.ts` — Hono middleware gates: `publicRoute`,
  `protectedRoute`, and `adminRoute`. Every business endpoint must choose one of
  these gates instead of hand-writing auth checks. After `protectedRoute` or
  `adminRoute`, read `c.var.currentUser` as the non-null `AuthUser`.
  `protectedRoute` returns 401 when no user exists; `adminRoute` returns 401
  without a user and 403 when the user is not an admin.
- `_core/env.ts` — `env.{NODE_ENV, PORT, SKY_FC_SERVER_PORT, ALLOWED_ORIGINS,
  BETTER_AUTH_URL, BETTER_AUTH_SECRET, PUBLIC_BACKEND_URL, SKYBASE_DB_ENDPOINT,
  SKYBASE_DB_TOKEN, SKYBASE_DB_NAMESPACE, SKYWORK_GATEWAY_BASE_URL,
  SKYWORK_API_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET}`.
  (`GOOGLE_CLIENT_*` is a local-dev convenience only — deployed Google sign-in
  uses the third-party gateway flow, not these; see Hard Boundaries.)
- `_core/public-url.ts` — `getPublicBaseUrl()` → the backend's own public base
  URL for absolute callback / webhook URLs (deploy-injected `PUBLIC_BACKEND_URL`
  only, never the request Host — host-header poisoning). Returns `""` when not
  injected: treat that as "no trusted backend URL" and do NOT register a webhook
  from it.
- `@repo/shared/http` — `apiSuccess(data)` → `{ ok: true, data }`;
  `apiFailure(code, message)` → `{ ok: false, error: { code, message } }`.
  ALL API responses use this envelope.

Scaffold-provided platform services (server-only):

- `services/s3_storage.ts` — file storage through the platform OSS proxy:
  `storagePut(...)`, `storageGetForUser(id, userId)`, `storageDeleteForUser(id, userId)`,
  `storageGetByPath(path)`, `storageGetDownloadUrl(id)`, `storageErrorResponse(error)`;
  `type StoredFile`. Ready-made authed routes exist at `/api/storage` (multipart
  upload field `file`, optional `path`). Use this for uploads/files — do not wire a
  different storage provider unless explicitly asked.
- `services/message.ts` — platform template email via Skywork Gateway:
  `sendEmailVerificationCode(...)` (structured fields only). No arbitrary
  subject/body/from emails through this channel.

Client (`apps/client/src/lib/`):

- `api.ts` — `apiFetch(path, init?: RequestInit & { auth?: boolean })` → `Response`.
  Adds base URL + `/api` prefix + Bearer header; pass `/todos` or `todos`, NOT
  `/api/todos`. Non-OK responses already trigger the shared error toast; still check
  `response.ok`. Also exports `startThirdPartyGoogleAuth(landingPath?)` — the
  production Google sign-in entry (see Hard Boundaries) — and
  `syncAuthTokenFromUrl()` (already called in `main.tsx` — don't call it again).
- `api-base.ts` — `apiUrl(path)`, `authUrl(path?)`, `API_BASE_URL` (build-time
  `VITE_API_BASE_URL` > runtime `app-config.js` > same-origin). Do not edit; do not
  remove the `app-config.js` script tag from `index.html`.
- `auth.ts` — `authClient` (Better Auth React client: `signIn`, `signUp`, `useSession`);
  token helpers `getAuthToken()` / `setAuthToken()` / `clearAuthToken()` /
  `syncAuthTokenFromResult(result)`. Session = Bearer token in localStorage
  (client and API are on different domains in production — cookies cannot work).
  Never reimplement token storage.
- `components/auth/route-guards.tsx` — `RequireAuth` and `RequireVerifiedEmail`
  for client pages that need a logged-in or verified user.
- `components/auth/AdminGuard.tsx` — `AdminGuard` / `RequireAdmin` for client
  `/admin/*` pages. It reuses `RequireAuth`, then confirms the server-side role
  through `/api/me/profile`; that role is authoritative because `withSession`
  hydrates it from DB `user.role`. Non-admin users must see a 403 state.

## Adding a Feature (fixed recipe)

1. Table: add to `apps/server/db/schema.ts` (Drizzle sqlite-core) AND write matching
   DDL as `apps/server/migrations/00N_<name>.sql` (SQLite dialect; see exemplar).
2. Service: `apps/server/services/<feature>.ts` — Drizzle queries via `getDb()`,
   throw `DatabaseError` for not-found/invalid.
3. Route: `apps/server/routes/<feature>.route.ts` — choose `publicRoute`,
   `protectedRoute`, or `adminRoute`, zod-validate input, call the service, wrap
   results in `apiSuccess` / `apiFailure`.
   It auto-mounts at `/api/<feature>`; no other wiring.
4. Client: call via `apiFetch("/<feature>")`. Page routes go in `App.tsx` ABOVE the
   catch-all `*` route.
5. Auth UI: adapt the scaffold's `pages/auth/Index.tsx` (`/auth` route, includes the
   email verification step) — never write a login page from scratch.
6. If the app has any client `/admin/*` route, every `/admin/*` route MUST be
   wrapped in `AdminGuard` / `RequireAdmin`; hiding navigation is not sufficient.
   Direct URL access by non-admin users must render 403 or redirect before any
   admin UI renders. Every backend admin API MUST use `adminRoute`.

## Exemplar (todos — copy this shape)

`apps/server/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS todos (
  id        TEXT    PRIMARY KEY,
  userId    TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,            -- boolean as 0/1
  createdAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_todos_userId ON todos (userId);
```

SQLite dialect rules: TEXT or `INTEGER PRIMARY KEY AUTOINCREMENT` ids, `INTEGER` 0/1
booleans, `TEXT` for strings/JSON/timestamps. No `SERIAL`, `BOOLEAN`, `JSONB`, `uuid`,
`NOW()`, `gen_random_uuid()`.

`apps/server/services/todos.ts` (Drizzle pattern — the service owns data access):

```ts
import { and, desc, eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { todos } from "../db/schema";

export async function listTodos(userId: string) {
  return getDb().select().from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(desc(todos.updatedAt)).limit(100);
}

export async function createTodo(userId: string, input: { title: string }) {
  const rows = await getDb().insert(todos)
    .values({ userId, title: input.title, done: false }).returning();
  return rows[0];
}

export async function updateTodo(userId: string, id: string, input: { title?: string; done?: boolean }) {
  const rows = await getDb().update(todos)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(todos.id, id), eq(todos.userId, userId))).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "Todo not found", 404);
  return rows[0];
}
```

`apps/server/routes/todos.route.ts` (route pattern — choose auth helper, validate, envelope):

```ts
import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { protectedRoute } from "../_core/route-helpers";
import { createTodo, listTodos } from "../services/todos";

const CreateTodoSchema = z.object({ title: z.string().trim().min(1).max(200) });

export const todosRouter = new Hono();

todosRouter.get("/", protectedRoute, async (c) => {
  const user = c.var.currentUser;
  try {
    return c.json(apiSuccess({ todos: await listTodos(user.id) }), 200);
  } catch (error) {
    if (error instanceof DatabaseError)
      return c.json(apiFailure(error.code, error.message), error.status === 503 ? 503 : error.status === 404 ? 404 : 502);
    throw error;
  }
});

todosRouter.post("/", protectedRoute, async (c) => {
  const user = c.var.currentUser;
  const parsed = CreateTodoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Title is required"), 400);
  return c.json(apiSuccess({ todo: await createTodo(user.id, parsed.data) }), 200);
});
```

Auto-mounted at `/api/todos` by the route registry. Register both `""` and `"/"` for
collection GET/POST if clients may omit the trailing slash.

## Client Auth UX Rules

- After a successful `signIn` / `signUp`, navigate with the router (`useNavigate()` →
  `navigate("/")`) or render the authed UI reactively. NEVER call
  `window.location.reload()` to "refresh" auth: this is a client-side-routed SPA, so
  a reload re-renders the current route — on `/auth` it just re-shows the login form,
  stranding a now-authenticated user.
- The login route reverse-guards itself: an already-authenticated user is redirected
  away (`<Navigate to="/" replace />`). Keep this when you adapt the page.
- Session gating is three-state: loading / authed / guest. Render a loader while the
  token-based session check resolves; never treat "loading" as "guest" or you bounce
  a freshly-authenticated user back to login on first paint.
- Cross-origin iframe caveat: a `localStorage` Bearer session may be partitioned or
  blocked when the site is embedded in a cross-origin preview iframe. Test login in a
  top-level browser tab.

## Frontend UI

- Use existing shadcn/ui components from `apps/client/src/components/ui/`.
- Use Tailwind CSS variables and tokens from `apps/client/src/index.css`.
- Keep page code under `apps/client/src/pages/`; reusable client helpers under
  `apps/client/src/lib/`.

## Validation

Use the narrowest check that covers the change.

- API boundary, auth, db, lint config, or cross-package changes: `pnpm lint`
- Client-only lint changes: `pnpm --filter client lint`
- Local ESLint rule changes: `cd apps/client && node eslint-rules/no-direct-api-request.test.js`
- Dev server: `cd apps/client && pnpm dev` (frontend at `http://localhost:3100`,
  Hono backend mounted under `/api/*`)
