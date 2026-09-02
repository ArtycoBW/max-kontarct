const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = { ...process.env, API_PROXY_TARGET: "http://127.0.0.1:4301", API_INTERNAL_BASE_URL: "http://127.0.0.1:4301/api/v1" };
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run([require.resolve("@nestjs/cli/bin/nest.js", { paths: [path.join(root, "apps/api")] }), "build"], path.join(root, "apps/api"));
run([require.resolve("next/dist/bin/next"), "build", "apps/web"]);
run([require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)]);
