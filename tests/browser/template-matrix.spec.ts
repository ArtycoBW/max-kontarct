import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { actor, maxProof } from "./helpers";

type Case = { slug: string; input: Record<string, unknown>; answers: Record<string, string>; completeField: string };
const cases: Case[] = JSON.parse(readFileSync("tests/fixtures/contract-cases.json", "utf8"));
for (const [index, item] of cases.entries()) {
  test(`${item.slug}: incomplete/complete inputs, answer validation, access and generation`, async ({ browser }) => {
    const context = await actor(browser, 71300 + index, `+7999700130${index}`);
    const api = context.request;
    expect((await api.post("/api/v1/auth/max", { data: { initData: maxProof(71300 + index) } })).status()).toBe(200);
    const base = `/api/v1/templates/${item.slug}`;
    const template = await (await api.get(base)).json();
    const templateVersionId = template.currentVersion.id;
    const start = await api.post(`${base}/clarifications`, { data: { answers: item.input, templateVersionId } });
    expect(start.status(), await start.text()).toBe(200);
    const session = await start.json();
    expect(session.status).toBe("NEED_MORE_INFO");
    expect(session.questions.map((question: { id: string }) => question.id)).toEqual(Object.keys(item.answers));
    const owned = `${base}/clarifications/${session.id}`;
    expect((await api.post(`${owned}/generation`)).status()).toBe(409);
    const alien = await browser.newContext({ baseURL: "http://127.0.0.1:4300" });
    expect((await alien.request.get(owned)).status()).toBe(401);
    await alien.request.post("/api/v1/auth/max", { data: { initData: maxProof(71400 + index) } });
    expect((await alien.request.get(owned)).status()).toBe(404);
    expect((await alien.request.post(`${owned}/answers`, { data: { answers: item.answers } })).status()).toBe(404);
    expect((await alien.request.post(`${owned}/generation`)).status()).toBe(404);
    await alien.close();
    for (const answers of [{}, { ...item.answers, unknownQuestion: "value" }, { ...item.answers, [Object.keys(item.answers)[0]]: "потом" }, { ...item.answers, [Object.keys(item.answers)[0]]: 123 }, { ...item.answers, [Object.keys(item.answers)[0]]: "x".repeat(1001) }]) {
      expect((await api.post(`${owned}/answers`, { data: { answers } })).status()).toBe(400);
      expect((await (await api.get(owned)).json()).answers).toEqual({});
    }
    const concurrent = await Promise.all([api.post(`${owned}/answers`, { data: { answers: item.answers } }), api.post(`${owned}/answers`, { data: { answers: item.answers } })]);
    expect(concurrent.map(response => response.status()).sort()).toEqual([200, 409]);
    expect(await (await api.get(owned)).json()).toMatchObject({ status: "READY_TO_GENERATE", questions: [], answers: item.answers });
    expect((await api.post(`${owned}/answers`, { data: { answers: item.answers } })).status()).toBe(409);
    expect((await api.post(`${owned}/generation`)).status()).toBe(202);
    await expect.poll(async () => (await (await api.get(`${owned}/generation`)).json()).status).toBe("COMPLETED");
    const completed = await (await api.get(`${owned}/generation`)).json();
    expect(completed.draft.sections.length).toBeGreaterThanOrEqual(3);
    expect(completed.draft.sections[0].heading).toBe("Условия сделки");
    const confirmed = completed.draft.sections[0].clauses.join("\n");
    for (const answer of Object.values(item.answers)) expect(confirmed).toContain(answer);
    const amount = Number(item.input.price ?? item.input.paymentAmount ?? item.input.loanAmount);
    expect(confirmed.replace(/\s/g, "")).toContain(String(amount));
    for (const [key, value] of Object.entries(item.input)) {
      if (/Date$/.test(key)) expect(confirmed).toContain(String(value).split("-").reverse().join("."));
    }
    expect((await (await api.post(`${owned}/generation`)).json()).draft).toEqual(completed.draft);
    const completeAnswers = { ...item.input, [item.completeField]: `${item.input[item.completeField]}. ${Object.values(item.answers).join(". ")}` };
    const complete = await api.post(`${base}/clarifications`, { data: { answers: completeAnswers, templateVersionId } });
    expect(complete.status()).toBe(200);
    expect(await complete.json()).toMatchObject({ status: "READY_TO_GENERATE", questions: [] });
    expect((await api.post(`${base}/validate`, { data: { answers: { ...item.input, surprise: true }, templateVersionId } })).status()).toBe(400);
    expect((await api.post(`${base}/validate`, { data: { answers: item.input, templateVersionId: "00000000-0000-4000-8000-000000000000" } })).status()).toBe(409);
    const numericKey = ["price", "paymentAmount", "loanAmount"].find(key => key in item.input)!;
    expect((await api.post(`${base}/validate`, { data: { answers: { ...item.input, [numericKey]: -1 }, templateVersionId } })).status()).toBe(400);
    const dateKey = Object.keys(item.input).find(key => /Date$/.test(key))!;
    for (const invalidDate of ["2020-01-01", "2070-02-30", "not-a-date"]) {
      expect((await api.post(`${base}/validate`, { data: { answers: { ...item.input, [dateKey]: invalidDate }, templateVersionId } })).status()).toBe(400);
    }
    await context.close();
  });
}
