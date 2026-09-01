const DEVELOPMENT_DEFAULTS = {
  AI_PROVIDER: "fake",
  API_PORT: 3001,
  AUTH_COOKIE_NAME: "max_contract_session",
  AUTH_REDIS_PREFIX: "max-contract:auth",
  AUTH_SESSION_TTL_SECONDS: 7 * 24 * 60 * 60,
  CONSENT_PERSONAL_DATA_VERSION: "dev-v1",
  CONSENT_STATUS_NOTIFICATIONS_VERSION: "dev-v1",
  CONSENT_TERMS_VERSION: "dev-v1",
  CONTRACT_GENERATION_QUEUE_PREFIX: "max-contract",
  DADATA_API_TOKEN: "",
  DADATA_SECRET_KEY: "",
  DADATA_TIMEOUT_MS: 5_000,
  DATA_NORMALIZATION_PROVIDER: "mock",
  FILE_UPLOAD_MAX_BYTES: 20 * 1024 * 1024,
  DEAL_INVITATION_TTL_SECONDS: 3 * 24 * 60 * 60,
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
  MAX_API_URL: "https://platform-api2.max.ru",
  MAX_BOT_TOKEN: "",
  MAX_CONTACT_FUTURE_SKEW_SECONDS: 30,
  MAX_CONTACT_TTL_SECONDS: 5 * 60,
  MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
  MAX_INIT_DATA_TTL_SECONDS: 60 * 60,
  MAX_WEBHOOK_SECRET: "",
  MINIO_ACCESS_KEY: "max_contract",
  MINIO_AUTO_CREATE_BUCKET: true,
  MINIO_BUCKET: "max-contract-dev",
  MINIO_ENDPOINT: "http://localhost:9100",
  MINIO_REGION: "ru-central1",
  MINIO_SECRET_KEY: "max_contract_dev_secret",
  S3_FORCE_PATH_STYLE: true,
  PUBLIC_WEB_URL: "http://localhost:3000",
  REDIS_URL: "redis://localhost:6381",
  THROTTLE_LIMIT: 120,
  THROTTLE_TTL_MS: 60_000,
  YANDEX_AI_API_KEY: "",
  YANDEX_AI_FOLDER_ID: "",
  YANDEX_AI_MAX_RETRIES: 1,
  YANDEX_AI_MAX_TOKENS: 1_200,
  YANDEX_AI_MODEL: "yandexgpt-5.1",
  YANDEX_AI_RETRY_DELAY_MS: 250,
  YANDEX_AI_TEMPERATURE: 0.1,
  YANDEX_AI_TIMEOUT_MS: 20_000,
} as const;

const REQUIRED_PRODUCTION_KEYS = [
  "CORS_ORIGINS",
  "CONSENT_PERSONAL_DATA_VERSION",
  "CONSENT_STATUS_NOTIFICATIONS_VERSION",
  "CONSENT_TERMS_VERSION",
  "DATABASE_URL",
  "MAX_BOT_TOKEN",
  "MAX_WEBHOOK_SECRET",
  "PUBLIC_WEB_URL",
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

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = parseInteger(value, fallback, key, minimum);
  if (parsed > maximum) {
    throw new Error(`${key} must be less than or equal to ${maximum}`);
  }
  return parsed;
}

function parseBoundedNumber(
  value: unknown,
  fallback: number,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be between ${minimum} and ${maximum}`);
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

    const storageMissing = [
      ["S3_ACCESS_KEY", "MINIO_ACCESS_KEY", "MINIO_ROOT_USER"],
      ["S3_SECRET_KEY", "MINIO_SECRET_KEY", "MINIO_ROOT_PASSWORD"],
      ["S3_BUCKET", "MINIO_BUCKET"],
      ["S3_ENDPOINT", "MINIO_ENDPOINT"],
    ].filter((aliases) => !aliases.some((key) =>
      typeof input[key] === "string" && input[key].trim().length > 0,
    ));
    if (storageMissing.length > 0) {
      throw new Error("Missing production S3 storage variables");
    }
  }

  const aiProvider = readString(
    input.AI_PROVIDER,
    nodeEnv === "production" ? "yandex" : DEVELOPMENT_DEFAULTS.AI_PROVIDER,
  );
  if (aiProvider !== "fake" && aiProvider !== "yandex") {
    throw new Error("AI_PROVIDER must be fake or yandex");
  }
  if (nodeEnv === "production" && aiProvider !== "yandex") {
    throw new Error("AI_PROVIDER must be yandex in production");
  }

  const yandexAiApiKey = readString(
    input.YANDEX_AI_API_KEY,
    DEVELOPMENT_DEFAULTS.YANDEX_AI_API_KEY,
  );
  const yandexAiFolderId = readString(
    input.YANDEX_AI_FOLDER_ID,
    DEVELOPMENT_DEFAULTS.YANDEX_AI_FOLDER_ID,
  );
  if (aiProvider === "yandex" && (!yandexAiApiKey || !yandexAiFolderId)) {
    throw new Error(
      "YANDEX_AI_API_KEY and YANDEX_AI_FOLDER_ID are required for Yandex AI",
    );
  }

  const dataNormalizationProvider = readString(
    input.DATA_NORMALIZATION_PROVIDER,
    DEVELOPMENT_DEFAULTS.DATA_NORMALIZATION_PROVIDER,
  );
  if (!new Set(["mock", "dadata"]).has(dataNormalizationProvider)) {
    throw new Error("DATA_NORMALIZATION_PROVIDER must be mock or dadata");
  }
  const dadataApiToken = readString(
    input.DADATA_API_TOKEN,
    DEVELOPMENT_DEFAULTS.DADATA_API_TOKEN,
  );
  const dadataSecretKey = readString(
    input.DADATA_SECRET_KEY,
    DEVELOPMENT_DEFAULTS.DADATA_SECRET_KEY,
  );
  if (dataNormalizationProvider === "dadata" && (!dadataApiToken || !dadataSecretKey)) {
    throw new Error("DADATA_API_TOKEN and DADATA_SECRET_KEY are required for DaData");
  }

  return {
    ...input,
    AI_PROVIDER: aiProvider,
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
    CONTRACT_GENERATION_QUEUE_PREFIX: readString(
      input.CONTRACT_GENERATION_QUEUE_PREFIX,
      DEVELOPMENT_DEFAULTS.CONTRACT_GENERATION_QUEUE_PREFIX,
    ),
    DEAL_INVITATION_TTL_SECONDS: parseBoundedInteger(
      input.DEAL_INVITATION_TTL_SECONDS,
      DEVELOPMENT_DEFAULTS.DEAL_INVITATION_TTL_SECONDS,
      "DEAL_INVITATION_TTL_SECONDS",
      5 * 60,
      30 * 24 * 60 * 60,
    ),
    DATABASE_URL: readString(
      input.DATABASE_URL,
      DEVELOPMENT_DEFAULTS.DATABASE_URL,
    ),
    DADATA_API_TOKEN: dadataApiToken,
    DADATA_SECRET_KEY: dadataSecretKey,
    DADATA_TIMEOUT_MS: parseBoundedInteger(
      input.DADATA_TIMEOUT_MS,
      DEVELOPMENT_DEFAULTS.DADATA_TIMEOUT_MS,
      "DADATA_TIMEOUT_MS",
      500,
      30_000,
    ),
    DATA_NORMALIZATION_PROVIDER: dataNormalizationProvider,
    FILE_UPLOAD_MAX_BYTES: parseBoundedInteger(
      input.FILE_UPLOAD_MAX_BYTES,
      DEVELOPMENT_DEFAULTS.FILE_UPLOAD_MAX_BYTES,
      "FILE_UPLOAD_MAX_BYTES",
      1024,
      50 * 1024 * 1024,
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
    MAX_API_URL: readString(
      input.MAX_API_URL,
      DEVELOPMENT_DEFAULTS.MAX_API_URL,
    ),
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
    MAX_WEBHOOK_SECRET: readString(
      input.MAX_WEBHOOK_SECRET,
      DEVELOPMENT_DEFAULTS.MAX_WEBHOOK_SECRET,
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
    S3_ACCESS_KEY: readString(
      input.S3_ACCESS_KEY ?? input.MINIO_ACCESS_KEY ?? input.MINIO_ROOT_USER,
      DEVELOPMENT_DEFAULTS.MINIO_ACCESS_KEY,
    ),
    S3_AUTO_CREATE_BUCKET: parseBoolean(
      input.S3_AUTO_CREATE_BUCKET ?? input.MINIO_AUTO_CREATE_BUCKET,
      nodeEnv !== "production" && DEVELOPMENT_DEFAULTS.MINIO_AUTO_CREATE_BUCKET,
      "S3_AUTO_CREATE_BUCKET",
    ),
    S3_BUCKET: readString(
      input.S3_BUCKET ?? input.MINIO_BUCKET,
      DEVELOPMENT_DEFAULTS.MINIO_BUCKET,
    ),
    S3_ENDPOINT: readString(
      input.S3_ENDPOINT ?? input.MINIO_ENDPOINT,
      DEVELOPMENT_DEFAULTS.MINIO_ENDPOINT,
    ),
    S3_FORCE_PATH_STYLE: parseBoolean(
      input.S3_FORCE_PATH_STYLE,
      DEVELOPMENT_DEFAULTS.S3_FORCE_PATH_STYLE,
      "S3_FORCE_PATH_STYLE",
    ),
    S3_REGION: readString(
      input.S3_REGION ?? input.MINIO_REGION,
      DEVELOPMENT_DEFAULTS.MINIO_REGION,
    ),
    S3_SECRET_KEY: readString(
      input.S3_SECRET_KEY ?? input.MINIO_SECRET_KEY ?? input.MINIO_ROOT_PASSWORD,
      DEVELOPMENT_DEFAULTS.MINIO_SECRET_KEY,
    ),
    NODE_ENV: nodeEnv,
    PUBLIC_WEB_URL: readString(
      input.PUBLIC_WEB_URL,
      DEVELOPMENT_DEFAULTS.PUBLIC_WEB_URL,
    ).replace(/\/$/, ""),
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
    YANDEX_AI_API_KEY: yandexAiApiKey,
    YANDEX_AI_FOLDER_ID: yandexAiFolderId,
    YANDEX_AI_MAX_RETRIES: parseBoundedInteger(
      input.YANDEX_AI_MAX_RETRIES,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_MAX_RETRIES,
      "YANDEX_AI_MAX_RETRIES",
      0,
      3,
    ),
    YANDEX_AI_MAX_TOKENS: parseBoundedInteger(
      input.YANDEX_AI_MAX_TOKENS,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_MAX_TOKENS,
      "YANDEX_AI_MAX_TOKENS",
      64,
      8_192,
    ),
    YANDEX_AI_MODEL: readString(
      input.YANDEX_AI_MODEL,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_MODEL,
    ),
    YANDEX_AI_RETRY_DELAY_MS: parseBoundedInteger(
      input.YANDEX_AI_RETRY_DELAY_MS,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_RETRY_DELAY_MS,
      "YANDEX_AI_RETRY_DELAY_MS",
      0,
      5_000,
    ),
    YANDEX_AI_TEMPERATURE: parseBoundedNumber(
      input.YANDEX_AI_TEMPERATURE,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_TEMPERATURE,
      "YANDEX_AI_TEMPERATURE",
      0,
      0.3,
    ),
    YANDEX_AI_TIMEOUT_MS: parseBoundedInteger(
      input.YANDEX_AI_TIMEOUT_MS,
      DEVELOPMENT_DEFAULTS.YANDEX_AI_TIMEOUT_MS,
      "YANDEX_AI_TIMEOUT_MS",
      1_000,
      120_000,
    ),
  };
}
