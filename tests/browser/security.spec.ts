import { test, expect } from "@playwright/test";
import { maxProof } from "./helpers";

test("authentication, IDOR and invitation rate limits on the real API", async ({ request }) => {
  const base = "http://127.0.0.1:4301/api/v1";
  expect((await request.post(`${base}/auth/max`, { headers: { Origin: "https://untrusted.example" }, data: { initData: maxProof(72001) } })).status()).toBe(403);
  expect((await request.get(`${base}/deals`)).status()).toBe(401);
  expect((await request.post(`${base}/auth/max`, { data: { initData: maxProof(72001).replace(/hash=[^&]+/, "hash=" + "a".repeat(64)) } })).status()).toBe(401);
  expect((await request.post(`${base}/auth/max`, { data: { initData: maxProof(72001, 7200) } })).status()).toBe(401);
  const proof = maxProof(72001);
  expect((await request.post(`${base}/auth/max`, { data: { initData: proof } })).ok()).toBe(true);
  expect((await request.post(`${base}/auth/max`, { data: { initData: proof } })).status()).toBe(401);
  expect((await request.get(`${base}/deals/10000000-0000-4000-8000-000000000001/workspace`)).status()).toBe(404);
  expect((await request.get(`${base}/deals/10000000-0000-4000-8000-000000000001/files/20000000-0000-4000-8000-000000000001/content`)).status()).toBe(404);
  const responses = [];
  for (let i = 0; i < 32; i++) responses.push((await request.get(`${base}/public/invitations/UnknownCode12345`)).status());
  expect(responses).toContain(429);
});
