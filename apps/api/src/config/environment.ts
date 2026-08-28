const DEVELOPMENT_DEFAULTS = {
  API_PORT: 3001,
  AUTH_COOKIE_NAME: "max_contract_session",
  AUTH_REDIS_PREFIX: "max-contract:auth",
  AUTH_SESSION_TTL_SECONDS: 7 * 24 * 60 * 60,
  CONSENT_PERSONAL_DATA_VERSION: "dev-v1",
  CONSENT_STATUS_NOTIFICATIONS_VERSION: "dev-v1",
  CONSENT_TERMS_VERSION: "dev-v1",
  CORS_ORIGINS: "http://localhost:3000,http://localhost:3002",
  DATABASE_URL:
    "postgresql://max_contract:max_contract_dev@localhost:5434/max_contract",
  DEV_MAX_FIRST_NAME: "Иван",
  DEV_MAX_LANGUAGE_CODE: "ru",
  DEV_MAX_LAST_NAME: "Тестовый",
  DEV_MAX_PHONE: "+79991234567",
  DEV_MAX_USER_ID: "1000000000001",
  DEV_MAX_USERNAME: "dev_max_user",
  LOG_LEVEL: "info",
  MAX_BOT_TOKEN: "",
  MAX_CONTACT_FUTURE_SKEW_SECONDS: 30,
  MAX_CONTACT_TTL_SECONDS: 5 * 60,
  MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
  MAX_INIT_DATA_TTL_SECONDS: 60 * 60,
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
  "CONSENT_PERSONAL_DATA_VERSION",
  "CONSENT_STATUS_NOTIFICATIONS_VERSION",
  "CONSENT_TERMS_VERSION",
  "DATABASE_URL",
  "MINIO_ACCESS_KEY",
  "MINIO_BUCKET",
  "MINIO_ENDPOINT",
  "MINIO_SECRET_KEY",
  "MAX_BOT_TOKEN",
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
    AUTH_COOKIE_NAME: readString(
      input.AUTH_COOKIE_NAME,
      DEVELOPMENT_DEFAULTS.AUTH_COOKIE_NAME,
    ),
    AUTH_REDIS_PREFIX: readString(
      input.AUTH_REDIS_PREFIX,
      DEVELOPMENT_DEFAULTS.AUTH_REDIS_PREFIX,
    ),
    AUTH_SESSION_TTL_SECONDS: parseInteger(
      input.AUTH_SESSION_TTL_SECONDS,
      DEVELOPMENT_DEFAULTS.AUTH_SESSION_TTL_SECONDS,
      "AUTH_SESSION_TTL_SECONDS",
      60,
    ),
    CORS_ORIGINS: readString(
      input.CORS_ORIGINS,
      DEVELOPMENT_DEFAULTS.CORS_ORIGINS,
    ),
    CONSENT_PERSONAL_DATA_VERSION: readString(
      input.CONSENT_PERSONAL_DATA_VERSION,
      DEVELOPMENT_DEFAULTS.CONSENT_PERSONAL_DATA_VERSION,
    ),
    CONSENT_STATUS_NOTIFICATIONS_VERSION: readString(
      input.CONSENT_STATUS_NOTIFICATIONS_VERSION,
      DEVELOPMENT_DEFAULTS.CONSENT_STATUS_NOTIFICATIONS_VERSION,
    ),
    CONSENT_TERMS_VERSION: readString(
      input.CONSENT_TERMS_VERSION,
      DEVELOPMENT_DEFAULTS.CONSENT_TERMS_VERSION,
    ),
    DATABASE_URL: readString(
      input.DATABASE_URL,
      DEVELOPMENT_DEFAULTS.DATABASE_URL,
    ),
    DEV_MAX_FIRST_NAME: readString(
      input.DEV_MAX_FIRST_NAME,
      DEVELOPMENT_DEFAULTS.DEV_MAX_FIRST_NAME,
    ),
    DEV_MAX_LANGUAGE_CODE: readString(
      input.DEV_MAX_LANGUAGE_CODE,
      DEVELOPMENT_DEFAULTS.DEV_MAX_LANGUAGE_CODE,
    ),
    DEV_MAX_LAST_NAME: readString(
      input.DEV_MAX_LAST_NAME,
      DEVELOPMENT_DEFAULTS.DEV_MAX_LAST_NAME,
    ),
    DEV_MAX_PHONE: readString(
      input.DEV_MAX_PHONE,
      DEVELOPMENT_DEFAULTS.DEV_MAX_PHONE,
    ),
    DEV_MAX_USER_ID: readString(
      input.DEV_MAX_USER_ID,
      DEVELOPMENT_DEFAULTS.DEV_MAX_USER_ID,
    ),
    DEV_MAX_USERNAME: readString(
      input.DEV_MAX_USERNAME,
      DEVELOPMENT_DEFAULTS.DEV_MAX_USERNAME,
    ),
    LOG_LEVEL: readString(input.LOG_LEVEL, DEVELOPMENT_DEFAULTS.LOG_LEVEL),
    MAX_BOT_TOKEN: readString(
      input.MAX_BOT_TOKEN,
      DEVELOPMENT_DEFAULTS.MAX_BOT_TOKEN,
    ),
    MAX_CONTACT_FUTURE_SKEW_SECONDS: parseInteger(
      input.MAX_CONTACT_FUTURE_SKEW_SECONDS,
      DEVELOPMENT_DEFAULTS.MAX_CONTACT_FUTURE_SKEW_SECONDS,
      "MAX_CONTACT_FUTURE_SKEW_SECONDS",
      0,
    ),
    MAX_CONTACT_TTL_SECONDS: parseInteger(
      input.MAX_CONTACT_TTL_SECONDS,
      DEVELOPMENT_DEFAULTS.MAX_CONTACT_TTL_SECONDS,
      "MAX_CONTACT_TTL_SECONDS",
      30,
    ),
    MAX_INIT_DATA_FUTURE_SKEW_SECONDS: parseInteger(
      input.MAX_INIT_DATA_FUTURE_SKEW_SECONDS,
      DEVELOPMENT_DEFAULTS.MAX_INIT_DATA_FUTURE_SKEW_SECONDS,
      "MAX_INIT_DATA_FUTURE_SKEW_SECONDS",
      0,
    ),
    MAX_INIT_DATA_TTL_SECONDS: parseInteger(
      input.MAX_INIT_DATA_TTL_SECONDS,
      DEVELOPMENT_DEFAULTS.MAX_INIT_DATA_TTL_SECONDS,
      "MAX_INIT_DATA_TTL_SECONDS",
      60,
    ),
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
