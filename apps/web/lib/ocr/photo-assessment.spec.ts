import { photoIssueDescription, photoQualityDescription } from "./photo-assessment";

it("does not claim a readable photo or invent a cause from missing OCR values", () => {
  expect(photoQualityDescription({ dark: false, glare: false, soft: false })).toContain("не обнаружено");
  expect(photoQualityDescription({ dark: true, glare: true, soft: false })).toContain("возможен блик");
  expect(photoIssueDescription({ field: "lastName", code: "missing" })).toContain("Точную причину определить не удалось");
  expect(photoIssueDescription({ field: "birthDate", code: "conflict" })).toContain("разные варианты");
  expect(photoIssueDescription({ field: "number", code: "missing" })).toContain("после обрезки");
});
