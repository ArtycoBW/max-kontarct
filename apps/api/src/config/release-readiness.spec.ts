import { checkReleaseConfiguration } from "./release-readiness";

const configured = {
  NODE_ENV: "production", MAX_BOT_TOKEN: "bot-secret", MAX_WEBHOOK_SECRET: "webhook-secret",
  AI_PROVIDER: "yandex", YANDEX_AI_API_KEY: "ai-secret", YANDEX_AI_FOLDER_ID: "folder-secret",
  DATA_NORMALIZATION_PROVIDER: "dadata", DADATA_API_TOKEN: "dadata-token", DADATA_SECRET_KEY: "dadata-secret",
  SMS_PROVIDER: "smsc", SMSC_API_KEY: "smsc-secret", SMSC_API_URL: "https://smsc.ru",
  CONSENT_ELECTRONIC_SIGNATURE_VERSION: "pep-v1", CONSENT_PERSONAL_DATA_VERSION: "pd-v1", CONSENT_TERMS_VERSION: "terms-v1", CONSENT_STATUS_NOTIFICATIONS_VERSION: "notifications-v1",
  OTP_HMAC_SECRET: "random-production-secret-at-least-32-characters", S3_ENDPOINT: "https://s3.example.test",
  S3_ACCESS_KEY: "storage-access", S3_SECRET_KEY: "storage-secret", S3_BUCKET: "private-bucket", S3_AUTO_CREATE_BUCKET: false,
  PUBLIC_WEB_URL: "https://example.test",
};
describe("release configuration audit", () => {
  it("keeps live verification and legal checks even with all configuration present", () => {
    expect(checkReleaseConfiguration(configured)).toMatchObject({ configurationReady: true, kind: "configuration-audit" });
    expect(checkReleaseConfiguration(configured).manualChecks).toHaveLength(6);
  });
  it.each([
    ["smsc", { SMS_PROVIDER: "max-test" }], ["dadata", { DATA_NORMALIZATION_PROVIDER: "mock" }],
    ["consent-versions", { CONSENT_ELECTRONIC_SIGNATURE_VERSION: "stage-pep-v1" }],
    ["otp-secret", { OTP_HMAC_SECRET: "short" }], ["public-https", { PUBLIC_WEB_URL: "http://localhost:3000" }],
    ["private-s3", { S3_AUTO_CREATE_BUCKET: true }], ["smsc", { SMSC_API_KEY: "" }],
  ])("identifies the unresolved %s dependency", (id, override) => {
    const result = checkReleaseConfiguration({ ...configured, ...override });
    expect(result.configurationReady).toBe(false);
    expect(result.checks.find(check => check.id === id)?.configured).toBe(false);
  });
  it("never prints tokens, endpoints, bucket names or raw environment values", () => {
    const result = JSON.stringify(checkReleaseConfiguration(configured));
    for (const key of ["MAX_BOT_TOKEN", "DADATA_SECRET_KEY", "SMSC_API_KEY", "S3_BUCKET", "S3_ENDPOINT", "OTP_HMAC_SECRET"] as const) expect(result).not.toContain(configured[key]);
  });
  it("does not mutate configuration", () => {
    const env = Object.freeze({ ...configured });
    checkReleaseConfiguration(env);
    expect(env).toEqual(configured);
  });
});
