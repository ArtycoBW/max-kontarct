const DEVELOPMENT_DEFAULTS = {
  API_PORT: 3001,
  CORS_ORIGINS: "http://localhost:3000,http://localhost:3002",
  DATABASE_URL:
    "postgresql://max_contract:max_contract_dev@localhost:5434/max_contract",
  LOG_LEVEL: "info",
  MINIO_ACCESS_KEY: "max_contract",
  MINIO_AUTO_CREATE_BUCKET: true,
  MINIO_BUCKET: "max-contract-dev",
  MINIO_ENDPOINT: "http://localhost:9100",
  MINIO_REGION: "ru-central1",
  MINIO_SECRET_KEY: "max_contract_dev_secret",
  REDIS_URL: "redis://localhost:6381",
  THROTTLE_LIMIT: 120,
  THROTTLE_TTL_MS: 60_000,
} as const;

const REQUIRED_PRODUCTION_KEYS = [
  "CORS_ORIGINS",
  "DATABASE_URL",
  "MINIO_ACCESS_KEY",
  "MINIO_BUCKET",
  "MINIO_ENDPOINT",
  "MINIO_SECRET_KEY",
  "REDIS_URL",
] as const;

type EnvironmentInput = Record<string, unknown>;

function parseInteger(
  value: unknown,
  fallback: number,
  key: string,
  minimum: number,
): number {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${key} must be an integer greater than or equal to ${minimum}`);
  }

  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw new Error(`${key} must be true or false`);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export function validateEnvironment(input: EnvironmentInput): EnvironmentInput {
  const nodeEnv = readString(input.NODE_ENV, "development");

  if (!new Set(["development", "test", "production"]).has(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production");
  }

  if (nodeEnv === "production") {
    const missing = REQUIRED_PRODUCTION_KEYS.filter(
      (key) => typeof input[key] !== "string" || input[key].trim().length === 0,
    );

    if (missing.length > 0) {
      throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
    }
  }

  return {
    ...input,
    API_PORT: parseInteger(
      input.API_PORT,
      DEVELOPMENT_DEFAULTS.API_PORT,
      "API_PORT",
      1,
    ),
    CORS_ORIGINS: readString(
      input.CORS_ORIGINS,
      DEVELOPMENT_DEFAULTS.CORS_ORIGINS,
    ),
    DATABASE_URL: readString(
      input.DATABASE_URL,
      DEVELOPMENT_DEFAULTS.DATABASE_URL,
    ),
    LOG_LEVEL: readString(input.LOG_LEVEL, DEVELOPMENT_DEFAULTS.LOG_LEVEL),
    MINIO_ACCESS_KEY: readString(
      input.MINIO_ACCESS_KEY ?? input.MINIO_ROOT_USER,
      DEVELOPMENT_DEFAULTS.MINIO_ACCESS_KEY,
    ),
    MINIO_AUTO_CREATE_BUCKET: parseBoolean(
      input.MINIO_AUTO_CREATE_BUCKET,
      nodeEnv !== "production" && DEVELOPMENT_DEFAULTS.MINIO_AUTO_CREATE_BUCKET,
      "MINIO_AUTO_CREATE_BUCKET",
    ),
    MINIO_BUCKET: readString(
      input.MINIO_BUCKET,
      DEVELOPMENT_DEFAULTS.MINIO_BUCKET,
    ),
    MINIO_ENDPOINT: readString(
      input.MINIO_ENDPOINT,
      DEVELOPMENT_DEFAULTS.MINIO_ENDPOINT,
    ),
    MINIO_REGION: readString(
      input.MINIO_REGION,
      DEVELOPMENT_DEFAULTS.MINIO_REGION,
    ),
    MINIO_SECRET_KEY: readString(
      input.MINIO_SECRET_KEY ?? input.MINIO_ROOT_PASSWORD,
      DEVELOPMENT_DEFAULTS.MINIO_SECRET_KEY,
    ),
    NODE_ENV: nodeEnv,
    REDIS_URL: readString(input.REDIS_URL, DEVELOPMENT_DEFAULTS.REDIS_URL),
    THROTTLE_LIMIT: parseInteger(
      input.THROTTLE_LIMIT,
      DEVELOPMENT_DEFAULTS.THROTTLE_LIMIT,
      "THROTTLE_LIMIT",
      1,
    ),
    THROTTLE_TTL_MS: parseInteger(
      input.THROTTLE_TTL_MS,
      DEVELOPMENT_DEFAULTS.THROTTLE_TTL_MS,
      "THROTTLE_TTL_MS",
      1_000,
    ),
  };
}
