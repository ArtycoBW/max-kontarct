import { photoIssueDescription, photoQualityDescription, photoResultTitle } from "./photo-assessment";
import { emptyPassport } from "./passport-parser";
import { buildPassportReview } from "./passport-review";

it("does not claim a readable photo or invent a cause from missing OCR values", () => {
  expect(photoQualityDescription({ dark: false, glare: false, soft: false })).toContain("не обнаружено");
  expect(photoQualityDescription({ dark: true, glare: true, soft: false })).toContain("возможен блик");
  expect(photoIssueDescription({ field: "lastName", code: "missing" })).toContain("Точную причину определить не удалось");
  expect(photoIssueDescription({ field: "birthDate", code: "conflict" })).toContain("разные варианты");
  expect(photoIssueDescription({ field: "number", code: "missing" })).toContain("целиком видна на фото");
  expect(photoIssueDescription({ field: "number", code: "missing" })).not.toContain("обрезки");
});

it("does not call a partially extracted address one fully read field", () => {
  expect(photoResultTitle(buildPassportReview({ ...emptyPassport, address: "Г. ПРИМЕР" }, ["registration"], []))).toBe("Адрес извлечён частично");
  expect(photoResultTitle(buildPassportReview({ ...emptyPassport, address: "Г. ПРИМЕР, Д. 1" }, ["registration"], [], ["address"]))).toContain("сверьте с паспортом");
  expect(photoResultTitle(buildPassportReview({ ...emptyPassport }, ["registration"], []))).toBe("Адрес не прочитан");
  expect(photoResultTitle(buildPassportReview({ ...emptyPassport, firstName: "Иван" }, ["identity"], []))).toBe("Прочитано 1 из 8 полей");
});
