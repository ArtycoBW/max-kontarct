import { expect, test } from "@playwright/test";
import { actor, onboarding } from "./helpers";

test("a new revision offers earlier clarification answers for explicit review without submitting them automatically", async ({ browser }) => {
  const context = await actor(browser, 72431, "+79997002431");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  const template = await (await page.request.get("/api/v1/templates/paid-services")).json();
  const description = "Подготовка презентации для обсуждения проекта";
  const answers = {
    serviceDescription: "Подготовить презентацию на десять слайдов",
    serviceLocation: "Онлайн, результат передаётся по электронной почте",
    completionDate: "2099-09-20", paymentAmount: 15000,
    paymentProcedure: "После оказания услуги",
  };
  const sessionUrl = "/api/v1/templates/paid-services/clarifications";
  const initial = await page.request.post(sessionUrl, { data: { templateVersionId: template.currentVersion.id, answers, description, subjectDocumentsParty: "INITIATOR" } });
  expect(initial.ok(), await initial.text()).toBe(true);
  const session = await initial.json();
  expect(session.status).toBe("NEED_MORE_INFO");
  const acceptance = "Заказчик проверяет PDF и подтверждает приёмку ответом в чате в течение трёх дней";
  const confirmed = Object.fromEntries(session.questions.map((question: { id: string }) => [question.id, acceptance]));
  const ready = await page.request.post(`${sessionUrl}/${session.id}/answers`, { data: { answers: confirmed } });
  expect((await ready.json()).status, await ready.text()).toBe("READY_TO_GENERATE");
  const generationUrl = `${sessionUrl}/${session.id}/generation`;
  expect((await page.request.post(generationUrl)).ok()).toBe(true);
  await expect.poll(async () => (await (await page.request.get(generationUrl)).json()).status).toBe("COMPLETED");
  const generated = await (await page.request.get(generationUrl)).json();
  expect(generated.clarificationAnswers).toMatchObject(confirmed);
  const creating = await page.request.post("/api/v1/deals", { data: { templateVersionId: template.currentVersion.id, title: "Уточнения новой редакции", description, creationPath: "TEMPLATE" } });
  expect(creating.ok()).toBe(true);
  const draft = await creating.json();
  const saved = await page.request.patch(`/api/v1/deals/${draft.id}/draft`, { data: { answers, description, currentStep: "INITIATOR", sourceGenerationId: generated.id, clarificationSessionId: session.id, subjectDocumentsParty: "INITIATOR", expectedUpdatedAt: draft.updatedAt } });
  expect(saved.ok()).toBe(true);
  const updated = await saved.json();
  expect((await page.request.post(`/api/v1/deals/${draft.id}/agreement/start`, { data: { expectedVersionId: updated.versionId, expectedUpdatedAt: updated.updatedAt } })).ok()).toBe(true);
  await page.goto(`/?WebAppStartParam=deal_${draft.id.replaceAll("-", "")}`);
  await page.getByRole("button", { name: "Изменить условия договора" }).click();
  const editor = page.getByRole("dialog", { name: "Новая редакция договора" });
  await editor.getByRole("textbox", { name: "Что меняется", exact: true }).fill("Уточняем порядок приёмки");
  const nextSessionResponse = page.waitForResponse(response => response.url().endsWith("/clarifications") && response.request().method() === "POST");
  await editor.getByRole("button", { name: "Подготовить новую редакцию" }).click();
  const nextSession = await (await nextSessionResponse).json();
  const question = nextSession.questions[0];
  await expect(editor.getByRole("textbox", { name: question.label, exact: true })).toHaveValue(acceptance);
  // The earlier answer is visible, but not yet recorded in this new session.
  const unsubmitted = await (await page.request.get(`${sessionUrl}/${nextSession.id}`)).json();
  expect(unsubmitted.answers).toEqual({});
  const revisedAcceptance = "Заказчик проверяет PDF и подтверждает приёмку ответом в чате в течение двух дней";
  await editor.getByRole("textbox", { name: question.label, exact: true }).fill(revisedAcceptance);
  await editor.getByRole("button", { name: "Продолжить подготовку" }).click();
  await expect(editor.getByRole("button", { name: "Сохранить новую редакцию" })).toBeVisible();
  const next = await (await page.request.get(`${sessionUrl}/${nextSession.id}/generation`)).json();
  expect(next.clarificationAnswers[question.id]).toBe(revisedAcceptance);
  await page.keyboard.press("Escape");
  expect((await (await page.request.get(`/api/v1/deals/${draft.id}/versions`)).json()).total).toBe(1);
  await context.close();
});
