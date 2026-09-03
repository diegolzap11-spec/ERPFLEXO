import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const serverBuildTarget =
  process.env.SERVER_BUILD_TARGET === "web"
    ? "web"
    : process.env.SERVER_BUILD_TARGET === "vercel"
      ? "vercel"
      : "fc";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

// The "fc" target's dist/index.js is committed to git for the existing
// Alibaba FC deploy pipeline (see .gitignore's `!apps/server/dist/`).
// The Vercel target builds into its own directory so a local
// `build:vercel` run never touches that committed artifact.
const outDir = serverBuildTarget === "vercel" ? "dist-vercel" : "dist";

export default defineConfig({
  envDir: "../..",
  ssr: {
    noExternal: true
  },
  resolve: {
    alias: [
      { find: /^@libsql\/client$/, replacement: "@libsql/client/web" },
      { find: /^@repo\/shared\/http$/, replacement: fromRoot("packages/shared/src/http.ts") },
      { find: /^@repo\/shared$/, replacement: fromRoot("packages/shared/src/index.ts") }
    ]
  },
  build: {
    ssr:
      serverBuildTarget === "web"
        ? "_core/fc-entry.web.ts"
        : serverBuildTarget === "vercel"
          ? "_core/vercel-entry.ts"
          : "_core/fc-entry.ts",
    outDir,
    emptyOutDir: true,
    target: "node20",
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "index.js"
      }
    }
  }
});
