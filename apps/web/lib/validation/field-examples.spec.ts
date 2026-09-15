import { fieldExample, prefillDescriptionLocation } from "./field-examples";

test("offers examples only for known address fields", () => {
  expect(fieldExample("termsLocation")).toContain("д. 10");
  expect(fieldExample("price")).toBeUndefined();
});
test("prefills a clearly stated address for questionnaire review without replacing edits", () => {
  const description = "Ремонт по адресу г. Казань, ул. Примерная, д. 10, кв. 2. Стоимость 20000 рублей.";
  expect(prefillDescriptionLocation(description, {}, ["workLocation"])).toEqual({ workLocation: "г. Казань, ул. Примерная, д. 10, кв. 2" });
  expect(prefillDescriptionLocation(description, { workLocation: "Онлайн" }, ["workLocation"])).toEqual({ workLocation: "Онлайн" });
  expect(prefillDescriptionLocation(description, {}, ["price"])).toEqual({});
  expect(prefillDescriptionLocation(description + description, {}, ["workLocation"])).toEqual({});
  expect(prefillDescriptionLocation("Старый адрес: " + description, {}, ["workLocation"])).toEqual({});
});
