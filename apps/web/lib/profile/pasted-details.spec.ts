import { parsePastedDetails } from "./pasted-details";

test("imports only labelled supplied values and normalizes real dates", () => {
  expect(parsePastedDetails("Фамилия: Примеров\nИмя: Иван\nДата рождения: 12.04.1995\nАдрес регистрации: г. Казань, ул. Примерная, д. 1\nТокен: секрет")).toEqual({ lastName: "Примеров", firstName: "Иван", birthDate: "1995-04-12", address: "г. Казань, ул. Примерная, д. 1" });
});
test("does not guess a field from unlabeled or ambiguous values", () => {
  expect(parsePastedDetails("Примеров Иван\nИмя: Иван\nИмя: Пётр\nДата рождения: 31.02.1995")).toEqual({});
});
