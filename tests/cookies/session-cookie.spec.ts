import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

// Compiled production cookie policy/controller; only identities/DB are synthetic.
// Actual HTTPS is essential: route.fulfill(Set-Cookie) can bypass browser policy.
require("reflect-metadata");
const express = require("express");
const { ConfigService } = require("@nestjs/config");
const { AuthService } = require("../../apps/api/dist/auth/auth.service");
const { AuthController } = require("../../apps/api/dist/auth/auth.controller");
const name = "max_contract_session";
const token = "s".repeat(43);
let certificateDirectory: string;
let tls: { key: Buffer; cert: Buffer };
let closeFixture = async () => {};

test.beforeAll(() => {
  let openssl = process.env.OPENSSL_BINARY || "openssl";
  if (process.platform === "win32" && !process.env.OPENSSL_BINARY) {
    const gitExecPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    const bundled = resolve(gitExecPath, "../../../usr/bin/openssl.exe");
    if (existsSync(bundled)) openssl = bundled;
  }
  certificateDirectory = mkdtempSync(join(realpathSync(tmpdir()), "max-contract-cookie-test-"));
  const keyPath = join(certificateDirectory, "localhost.key");
  const certPath = join(certificateDirectory, "localhost.crt");
  execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,IP:127.0.0.2,IP:127.0.0.3", "-keyout", keyPath, "-out", certPath], { stdio: "ignore" });
  tls = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
});

test.afterEach(async () => { await closeFixture(); });
test.beforeEach(({ browserName }) => {
  test.skip(browserName === "webkit" && process.platform === "win32", "Windows WebKit port does not implement the Apple CHIPS cookie store; verify on iOS 26.2+ / current macOS WebKit");
});
test.afterAll(() => {
  if (!certificateDirectory) return;
  const target = realpathSync(certificateDirectory);
  if (dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith("max-contract-cookie-test-")) throw new Error("Unsafe temporary certificate target");
  rmSync(target, { recursive: true });
});

async function installFixture() {
  let active = false;
  const service = new AuthService(new ConfigService({ NODE_ENV: "production", AUTH_COOKIE_NAME: name, AUTH_REDIS_PREFIX: "fixture", AUTH_SESSION_TTL_SECONDS: 3600 }), {}, {}, {}, {});
  service.authenticateMax = async () => { active = true; return { sessionToken: token, response: { user: { id: "fixture-user" } } }; };
  service.logout = async () => { active = false; };
  const controller = new AuthController(service);
  const servers: Server[] = [];
  closeFixture = async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
    }
  };
  async function listen(host: string, handler: ReturnType<typeof express>) {
    const server = createServer(tls, handler);
    servers.push(server);
    await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, host, done); });
    return `https://${host}:${(server.address() as AddressInfo).port}`;
  }
  const app = express();
  app.use((_req: unknown, res: any, next: () => void) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/", (_req: unknown, res: any) => res.type("html").send(`<main><button id="login">Login</button><button id="legacy">Legacy</button><button id="check">Profile</button><button id="logout">Logout</button><output id="status">idle</output></main><script>
    async function check(){document.querySelector('#status').textContent=String((await fetch('/profile',{credentials:'include'})).status)}
    document.querySelector('#login').onclick=async()=>{await fetch('/login',{method:'POST',credentials:'include'});await check()};
    document.querySelector('#legacy').onclick=async()=>{await fetch('/legacy',{method:'POST',credentials:'include'});await check()};
    document.querySelector('#check').onclick=check;
    document.querySelector('#logout').onclick=async()=>{await fetch('/logout',{method:'POST',credentials:'include'});await check()};
  </script>`));
  app.post("/login", async (req: any, res: any) => res.json(await controller.authenticateMax({ initData: "synthetic-proof" }, req, res)));
  app.post("/legacy", (_req: unknown, res: any) => { active = true; res.cookie(name, token, { ...service.getCookieOptions(), partitioned: false }).json({}); });
  app.get("/profile", (req: any, res: any) => {
    const allowed = active && (req.headers.cookie ?? "").split(";").some((pair: string) => pair.trim() === `${name}=${token}`);
    res.status(allowed ? 200 : 401).end();
  });
  app.post("/logout", async (req: any, res: any) => { req.auth = { user: { id: "fixture-user" } }; await controller.logout(req, res); res.status(204).end(); });
  const child = await listen("127.0.0.1", app);
  const host = express().use((_req: unknown, res: any) => res.type("html").send(`<iframe sandbox="allow-scripts allow-same-origin allow-forms" src="${child}/"></iframe>`));
  const parentA = await listen("127.0.0.2", host);
  const parentB = await listen("127.0.0.3", host);
  return { child, parentA, parentB };
}

test("partitioned session survives profile requests, reload and logout without JS token access", async ({ page }) => {
  const { child, parentA } = await installFixture();
  await page.goto(parentA);
  let frame = page.frameLocator("iframe");
  await frame.locator("#login").click();
  await expect(frame.locator("#status")).toHaveText("200");
  const childFrame = page.frames().find(frame => frame.url().startsWith(child))!;
  expect(await childFrame.evaluate(() => document.cookie)).not.toContain(name);
  await page.reload();
  frame = page.frameLocator("iframe");
  await frame.locator("#check").click();
  await expect(frame.locator("#status")).toHaveText("200");
  await frame.locator("#logout").click();
  await expect(frame.locator("#status")).toHaveText("401");
  expect((await page.context().cookies()).filter(cookie => cookie.name === name)).toEqual([]);
});

test("the same session is not shared with an unrelated embedding site", async ({ page }) => {
  const { parentA, parentB } = await installFixture();
  await page.goto(parentA);
  await page.frameLocator("iframe").locator("#login").click();
  await expect(page.frameLocator("iframe").locator("#status")).toHaveText("200");
  await page.goto(parentB);
  await page.frameLocator("iframe").locator("#check").click();
  await expect(page.frameLocator("iframe").locator("#status")).toHaveText("401");
  await page.goto(parentA);
  await page.frameLocator("iframe").locator("#check").click();
  await expect(page.frameLocator("iframe").locator("#status")).toHaveText("200");
});

test("new login replaces the legacy cookie without duplicate session cookies", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Migration check uses Chromium's partitionKey cookie metadata");
  const { child } = await installFixture();
  await page.goto(child);
  await page.locator("#legacy").click();
  await expect(page.locator("#status")).toHaveText("200");
  const legacy = (await page.context().cookies()).filter(cookie => cookie.name === name);
  expect(legacy).toHaveLength(1);
  expect(legacy[0].partitionKey).toBeUndefined();
  await page.locator("#login").click();
  await expect(page.locator("#status")).toHaveText("200");
  const current = (await page.context().cookies()).filter(cookie => cookie.name === name);
  expect(current).toHaveLength(1);
  expect(current[0].partitionKey).toBeTruthy();
  expect(current[0].httpOnly).toBe(true);
  expect(current[0].secure).toBe(true);
  await page.locator("#logout").click();
  await expect(page.locator("#status")).toHaveText("401");
  expect((await page.context().cookies()).filter(cookie => cookie.name === name)).toEqual([]);
});
