type Environment = Record<string, unknown>;
type Check = { id: string; configured: boolean; action: string };

/** Read-only configuration audit. Passing this is not a delivery test or legal approval. */
export function checkReleaseConfiguration(env: Environment) {
  const present = (key: string) => typeof env[key] === "string" && Boolean(env[key].trim());
  const https = (key: string) => {
    try { const url = new URL(String(env[key])); return url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname); } catch { return false; }
  };
  const finalVersion = (key: string) => present(key) && !/^(dev|stage|test|browser)(?:[-_]|$)/i.test(String(env[key]));
  const checks: Check[] = [
    { id: "production-environment", configured: env.NODE_ENV === "production", action: "Использовать production-окружение" },
    { id: "max", configured: present("MAX_BOT_TOKEN") && present("MAX_WEBHOOK_SECRET"), action: "Настроить отдельного бота и секрет webhook" },
    { id: "yandex-ai", configured: env.AI_PROVIDER === "yandex" && present("YANDEX_AI_API_KEY") && present("YANDEX_AI_FOLDER_ID"), action: "Настроить рабочий YandexGPT" },
    { id: "dadata", configured: env.DATA_NORMALIZATION_PROVIDER === "dadata" && present("DADATA_API_TOKEN") && present("DADATA_SECRET_KEY"), action: "Получить ключи клиента и переключить DaData" },
    { id: "smsc", configured: env.SMS_PROVIDER === "smsc" && (present("SMSC_API_KEY") || (present("SMSC_LOGIN") && present("SMSC_PASSWORD"))) && https("SMSC_API_URL"), action: "Получить реквизиты клиента и переключить доставку кодов на SMSC" },
    { id: "consent-versions", configured: ["CONSENT_ELECTRONIC_SIGNATURE_VERSION", "CONSENT_PERSONAL_DATA_VERSION", "CONSENT_TERMS_VERSION", "CONSENT_STATUS_NOTIFICATIONS_VERSION"].every(finalVersion), action: "Утвердить тексты согласий и заменить тестовые версии" },
    { id: "otp-secret", configured: present("OTP_HMAC_SECRET") && String(env.OTP_HMAC_SECRET).length >= 32 && !String(env.OTP_HMAC_SECRET).startsWith("dev-"), action: "Использовать отдельный случайный секрет OTP не короче 32 символов" },
    { id: "private-s3", configured: https("S3_ENDPOINT") && ["S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET"].every(present) && env.S3_AUTO_CREATE_BUCKET === false, action: "Настроить существующий приватный S3-бакет с HTTPS" },
    { id: "public-https", configured: https("PUBLIC_WEB_URL"), action: "Использовать рабочий HTTPS-домен" },
  ];
  return {
    kind: "configuration-audit" as const,
    configurationReady: checks.every(check => check.configured),
    checks,
    manualChecks: [
      "Реальная доставка SMS, баланс, отправитель и повторная отправка",
      "Реальный ответ DaData и поведение при недоступности провайдера",
      "Юридическая приёмка шаблонов, ролей и текстов ПЭП",
      "Приватность S3, versioning и независимая резервная копия",
      "Восстановление PostgreSQL из внешней копии и внешние оповещения",
      "Сквозная проверка двух аккаунтов в целевых клиентах MAX",
    ],
  };
}
