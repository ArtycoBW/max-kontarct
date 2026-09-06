// Read-only, sanitized configuration audit. Run after the API build; never sends SMS or writes data.
const path = require("node:path");
if (process.env.READINESS_ENV_FILE) require("dotenv").config({ path: process.env.READINESS_ENV_FILE, quiet: true });
const root = process.env.READINESS_ROOT || path.resolve(__dirname, "..");
const { validateEnvironment } = require(path.join(root, "apps/api/dist/config/environment"));
const { checkReleaseConfiguration } = require(path.join(root, "apps/api/dist/config/release-readiness"));
try {
  const result = checkReleaseConfiguration(validateEnvironment(process.env));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.configurationReady ? 0 : 2;
} catch {
  process.stderr.write("Конфигурация не прошла проверку. Проверьте обязательные переменные; значения секретов не выводятся.\n");
  process.exitCode = 1;
}
