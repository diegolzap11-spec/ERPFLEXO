import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("..", import.meta.url);
const cacheDir = process.env.OMA_LINT_CACHE_DIR || `${fileURLToPath(projectRoot)}/.cache/lint`;

const checks = [
  {
    name: "agents-contract",
    args: ["run", "check:contract"]
  },
  {
    name: "client-eslint",
    args: ["--filter", "client", "exec", "eslint", ".", "--cache", "--cache-location", `${cacheDir}/client-eslintcache`]
  },
  {
    name: "server-eslint",
    args: ["--filter", "server", "exec", "eslint", ".", "--cache", "--cache-location", `${cacheDir}/server-eslintcache`]
  },
  {
    name: "client-types",
    args: [
      "exec",
      "tsc",
      "-p",
      "apps/client/tsconfig.app.json",
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      `${cacheDir}/client.tsbuildinfo`
    ]
  },
  {
    name: "server-types",
    args: [
      "exec",
      "tsc",
      "-p",
      "apps/server/tsconfig.json",
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      `${cacheDir}/server.tsbuildinfo`
    ]
  }
];

function runCheck(check) {
  return new Promise((resolve) => {
    console.log(`\n> lint:${check.name}`);

    const child = spawn("pnpm", check.args, {
      cwd: projectRoot,
      shell: process.platform === "win32",
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", (error) => {
      console.error(`[lint:${check.name}] ${error.message}`);
      resolve(1);
    });
  });
}

const results = [];

await mkdir(cacheDir, { recursive: true });

for (const check of checks) {
  const code = await runCheck(check);
  results.push({ ...check, code });
}

const failed = results.filter((result) => result.code !== 0);

if (failed.length > 0) {
  console.error(`\nLint failed: ${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}

console.log("\nLint passed.");
