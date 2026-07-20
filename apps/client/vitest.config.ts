import { defineConfig } from "vitest/config";
import path from "node:path";

// Client-side test config. happy-dom (already in devDeps) is preferred over
// jsdom: smaller install footprint, ~3x faster startup, and the smoke / unit
// tests we run here don't depend on jsdom-only behavior.
//
// Includes the existing `lib/api-base.test.ts` plus any `src/__tests__/**`
// the agent (or scaffold) adds later. T2 (frontend smoke) lives under
// `src/__tests__/app.smoke.test.tsx`.
export default defineConfig({
  define: {
    __ROUTE_MESSAGING_ENABLED__: "true"
  },
  test: {
    name: "client",
    environment: "happy-dom",
    include: ["lib/**/*.test.ts", "src/**/*.test.{ts,tsx}", "src/__tests__/**/*.test.{ts,tsx}"],
    globals: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@repo/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "react-router-dom": path.resolve(__dirname, "./src/lib/react-router-dom-proxy.tsx"),
      "react-router-dom-original": "react-router-dom"
    }
  }
});
