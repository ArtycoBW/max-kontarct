const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { ensureDatabaseUrl } = require("./load-database-env.cjs");

ensureDatabaseUrl();

const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "deploy",
    "--schema",
    path.resolve(__dirname, "schema.prisma"),
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
