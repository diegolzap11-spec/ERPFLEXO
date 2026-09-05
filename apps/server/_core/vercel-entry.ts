import app from "./create-app";

// Vercel's native Hono framework detector wraps a plain exported Hono app
// instance itself (it does the Node req/res <-> Web Request/Response
// adaptation internally) — it does not want a pre-wrapped fetch handler like
// hono/vercel's handle(app) here. Keep exporting the raw instance.
export default app;
