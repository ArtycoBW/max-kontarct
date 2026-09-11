import { inspectCapture, type CaptureQuality } from "./image-quality";
import { preparePhoto, type PassportPhoto } from "./passport-ocr";
import type { PassportIssue } from "./passport-review";

export type PhotoQuality = Pick<CaptureQuality, "dark" | "glare" | "soft">;

export async function inspectPassportPhoto(photo: PassportPhoto, signal: AbortSignal): Promise<PhotoQuality> {
  const source = await preparePhoto(photo, signal), sample = document.createElement("canvas");
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 480 / Math.max(source.width, source.height));
    sample.width = Math.max(1, Math.round(source.width * scale)); sample.height = Math.max(1, Math.round(source.height * scale));
    const context = sample.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(source, 0, 0, sample.width, sample.height);
    const { dark, glare, soft } = inspectCapture(context.getImageData(0, 0, sample.width, sample.height)).quality;
    return { dark, glare, soft };
  } finally { source.width = source.height = sample.width = sample.height = 0; }
}

/** Image heuristics are observations, not a claim that they caused a missing field. */
export function photoQualityDescription(quality: PhotoQuality) {
  const problems = [quality.dark ? "мало света" : "", quality.glare ? "возможен блик" : "", quality.soft ? "мало чётких деталей" : ""].filter(Boolean);
  return problems.length ? `На снимке: ${problems.join(", ")}. Это может мешать чтению текста.` : "Явных проблем со светом и резкостью не обнаружено. Всё равно сверьте прочитанные данные с паспортом.";
}

export function photoIssueDescription(issue: PassportIssue) {
  if (issue.code === "conflict") return "Повторные чтения дали разные варианты. Поле оставлено пустым, чтобы не подставить неверные данные.";
  if (issue.code === "uncertain") return "Значение удалось извлечь, но оно требует внимательной сверки по оригиналу.";
  if (issue.code === "partial") return "Штамп прочитан не целиком: в адресе не хватает части сведений. Дополните их по паспорту.";
  if (issue.code === "invalid") return "Прочитанное значение не соответствует формату этого поля. Исправьте его по паспорту.";
  if (issue.field === "series" || issue.field === "number") return "Не удалось уверенно прочитать все цифры. Проверьте, что боковая строка с серией и номером целиком осталась после обрезки.";
  if (issue.field === "address") return "Не удалось выделить актуальный адрес в штампе. Нужен снимок всей отметки; адрес также можно внести вручную.";
  return "Алгоритм не смог выделить значение. Точную причину определить не удалось: проверьте этот участок снимка или заполните поле вручную.";
}
