const fs = require("node:fs");
const path = require("node:path");

const { config: loadEnvFile } = require("dotenv");

const LOCAL_DATABASE_URL =
  "postgresql://max_contract:max_contract_dev@localhost:5434/max_contract";

function ensureDatabaseUrl() {
  const apiRoot = path.resolve(__dirname, "..");
  const workspaceRoot = path.resolve(apiRoot, "../..");
  const envFiles = [
    path.join(workspaceRoot, ".env.local"),
    path.join(workspaceRoot, ".env"),
    path.join(apiRoot, ".env.local"),
    path.join(apiRoot, ".env"),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      loadEnvFile({ path: envFile, override: false, quiet: true });
    }
  }

  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }

  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  console.warn(
    "DATABASE_URL is not set; using the local Docker database on localhost:5434",
  );

  return LOCAL_DATABASE_URL;
}

module.exports = { ensureDatabaseUrl };
