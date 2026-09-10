import { expect, test } from "@playwright/test";
import { actor, onboarding } from "./helpers";

for (const [index, constructor] of ["SpeechRecognition", "webkitSpeechRecognition"].entries()) {
  test(`archive dictation lifecycle: ${constructor}, delayed start, live text, pauses, stop and teardown`, async ({ browser }) => {
    const context = await actor(browser, 75001 + index, `+7999700500${index + 1}`);
    await context.addInitScript(constructor => {
      class Recognition {
        onstart?: () => void; onend?: () => void;
        onerror?: (e: { error: string }) => void;
        onresult?: (e: unknown) => void;
        start() { state.starts++; }
        stop() { state.stops++; }
        abort() { state.aborts++; this.onend?.(); }
        constructor() { state.speech = this; }
      }
      const state = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown; speech: Recognition; starts: number; stops: number; aborts: number };
      delete state.SpeechRecognition; delete state.webkitSpeechRecognition;
      state[constructor as "SpeechRecognition"] = Recognition;
      state.starts = 0; state.stops = 0; state.aborts = 0;
    }, constructor);
    const page = await context.newPage();
    // Install before application scripts capture requestAnimationFrame/performance clocks.
    await page.clock.install();
    await page.goto("/"); await onboarding(page);
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Что хотите оформить?" });
    await field.fill("Нужна презентация.");
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.getByRole("button", { name: "Включить микрофон", exact: true }).click();
    expect(await page.evaluate(() => {
      const engine = (window as unknown as { speech: { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number } }).speech;
      return [engine.lang, engine.continuous, engine.interimResults, engine.maxAlternatives];
    })).toEqual(["ru-RU", true, true, 1]);
    await expect(page.getByText("Подключаю микрофон…", { exact: true })).toBeVisible();
    // A real service can take longer than half a second to open the microphone.
    await page.clock.runFor(600);
    await expect(page.getByRole("button", { name: "Остановить диктовку" })).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => (window as unknown as { speech: { onstart: () => void } }).speech.onstart());
    await page.clock.runFor(100);
    await expect(field).toBeFocused();
    await expect(page.getByText("Слушаю… Говорите по-русски.", { exact: true })).toBeVisible();
    // No app-imposed minute timer; only the service or the user ends dictation, as in Arbit.
    await page.clock.runFor(65_000);
    expect(await page.evaluate(() => {
      const state = window as unknown as { starts: number; stops: number; aborts: number };
      return [state.starts, state.stops, state.aborts];
    })).toEqual([1, 0, 0]);
    const emit = async (texts: [string, boolean][], resultIndex: number) => page.evaluate(({ texts, resultIndex }) => {
      (window as unknown as { speech: { onresult: (e: unknown) => void } }).speech.onresult({ resultIndex, results: texts.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) });
    }, { texts, resultIndex });
    await emit([["на десять", false]], 0);
    await expect(field).toHaveValue("Нужна презентация. На десять");
    await emit([["на десять слайдов", true]], 0);
    await page.clock.runFor(1300);
    await emit([["на десять слайдов", true], ["готовый файл в PDF", false]], 1);
    await expect(field).toHaveValue("Нужна презентация. На десять слайдов. Готовый файл в PDF");
    await page.getByRole("button", { name: "Остановить диктовку" }).click();
    // Last final words can arrive after stop() and must still replace the interim hypothesis.
    await emit([["на десять слайдов", true], ["готовый файл в PPTX и PDF", true]], 1);
    await page.evaluate(() => (window as unknown as { speech: { onend: () => void } }).speech.onend());
    await expect(field).toHaveValue("Нужна презентация. На десять слайдов. Готовый файл в PPTX и PDF");
    await expect(page.getByRole("button", { name: "Продиктовать", exact: true })).toBeVisible();
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => (window as unknown as { starts: number }).starts)).toBe(1);
    // Browser-originated immediate end is actionable, not a silent reset or an infinite mic retry.
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.clock.runFor(500);
    await page.evaluate(() => (window as unknown as { speech: { onend: () => void } }).speech.onend());
    await expect(page.getByText(/Браузер завершил голосовой ввод без текста/)).toBeVisible();
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.evaluate(() => (window as unknown as { speech: { onerror: (e: unknown) => void } }).speech.onerror({ error: "network" }));
    await expect(page.getByText(/Сервис распознавания браузера недоступен по сети/)).toBeVisible();
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.keyboard.press("Escape"); await page.clock.runFor(1600);
    await expect(page.getByRole("button", { name: "Продиктовать", exact: true })).toBeVisible();
    // Force-mounted tabs retain text, but must never retain a hidden microphone session.
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.getByRole("tab", { name: "Готовые шаблоны", exact: true }).click();
    await page.getByRole("tab", { name: "С помощью ИИ", exact: true }).click();
    await expect(page.getByRole("button", { name: "Продиктовать", exact: true })).toBeVisible();
    await expect(field).toHaveValue("Нужна презентация. На десять слайдов. Готовый файл в PPTX и PDF");
    await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.clock.runFor(500);
    // The test advances JS time by a minute; native WAAPI has a separate real-time clock.
    // Complete only the unrelated screen transition before asserting React's mic cleanup.
    await page.locator(".screen-motion").evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
    await expect(field).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { aborts: number }).aborts)).toBe(4);
    await context.close();
  });
}
