import { handle } from "hono/vercel";
import app from "./create-app";

// Vercel Functions accept a Web-standard fetch handler: (req: Request) =>
// Response | Promise<Response>. This must run on Vercel's Node.js runtime
// (the default — do not switch this function to the Edge runtime): better-auth's
// password hashing calls node:crypto's scrypt/randomBytes directly, which the
// Edge runtime does not provide.
export default handle(app);
