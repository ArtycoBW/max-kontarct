import { inspectPastedDetails, parsePastedDetails } from "./pasted-details";

test("imports only labelled supplied values and normalizes real dates", () => {
  expect(parsePastedDetails("Фамилия: Примеров\nИмя: Иван\nДата рождения: 12.04.1995\nАдрес регистрации: г. Казань, ул. Примерная, д. 1\nТокен: секрет")).toEqual({ lastName: "Примеров", firstName: "Иван", birthDate: "1995-04-12", address: "г. Казань, ул. Примерная, д. 1" });
});
test("does not guess a field from unlabeled or ambiguous values", () => {
  expect(parsePastedDetails("Примеров Иван\nИмя: Иван\nИмя: Пётр\nДата рождения: 31.02.1995")).toEqual({});
});

// Synthetic values only. The label/order structure is from the supplied Gosuslugi example.
const copiedPassport = "Серия и номер: 1234 567890\r\nКем выдан: ОТДЕЛ МВД ПО ПРИМЕРНОМУ РАЙОНУ\r\nДата выдачи: 15.05.2020\r\nКод подразделения: 123-456\r\nФИО: Примеров Иван Петрович\r\nПол: Мужской\r\nДата рождения: 12.04.1995\r\nМесто рождения: ГОР. Казань";
const expected = { series: "1234", number: "567890", issuer: "ОТДЕЛ МВД ПО ПРИМЕРНОМУ РАЙОНУ", issuedAt: "2020-05-15", divisionCode: "123-456", lastName: "Примеров", firstName: "Иван", middleName: "Петрович", gender: "М", birthDate: "1995-04-12", birthPlace: "ГОР. Казань" };

test("imports all eleven fields in the provided Gosuslugi structure without inventing an address", () => {
  expect(inspectPastedDetails(copiedPassport)).toEqual({ data: expected, reviewFields: [] });
});

test.each([": ", "\n", "\t"])("accepts labels separated from values by %j", separator => {
  expect(parsePastedDetails(copiedPassport.replace(/: /g, separator))).toEqual(expected);
});

test("accepts multiline address/issuer, non-breaking spaces, gender and compact division code", () => {
  expect(parsePastedDetails("Паспорт РФ\nФ.И.О.: Примерова Анна Ивановна\nСерия и номер паспорта\n12\u00a034 567890\nПол: Женский\nКод подразделения: 123456\nКем выдан:\nОТДЕЛ МВД\nПО ПРИМЕРНОМУ РАЙОНУ\nАдрес регистрации\nг. Казань, ул. Примерная,\nд. 1, кв. 2")).toEqual({ lastName: "Примерова", firstName: "Анна", middleName: "Ивановна", series: "1234", number: "567890", gender: "Ж", divisionCode: "123-456", issuer: "ОТДЕЛ МВД ПО ПРИМЕРНОМУ РАЙОНУ", address: "г. Казань, ул. Примерная, д. 1, кв. 2" });
});

test("normalizes equivalent duplicate fields and excludes conflicts permanently", () => {
  expect(parsePastedDetails("Серия: 12 34\nСерия и номер: 1234 567890\nПол: мужской\nПол: М")).toEqual({ series: "1234", number: "567890", gender: "М" });
  expect(inspectPastedDetails("Имя: Иван\nФИО: Примеров Пётр Иванович\nИмя: Иван")).toEqual({ data: { lastName: "Примеров", middleName: "Иванович" }, reviewFields: ["firstName"] });
});

test("rejects invalid formats, does not harvest unrelated IDs or concatenate unknown labelled data", () => {
  expect(parsePastedDetails("Серия и номер: 123456789\nДата рождения: 31.02.1995\nКод подразделения: 12345\nПол: неизвестен\nСНИЛС: 12345678901\nКем выдан: ОТДЕЛ МВД\nТокен: секрет")).toEqual({ issuer: "ОТДЕЛ МВД" });
  expect(parsePastedDetails("1234 567890\nПримеров Иван Петрович")).toEqual({});
  expect(parsePastedDetails("Адрес регистрации\nг. Казань, ул. Примерная, д. 1\nСНИЛС\n12345678901")).toEqual({ address: "г. Казань, ул. Примерная, д. 1" });
});

test("keeps two-part full name and ISO dates but does not infer an ambiguous multipart name", () => {
  expect(parsePastedDetails("ФИО: Примеров Иван\nДата рождения: 1995-04-12")).toEqual({ lastName: "Примеров", firstName: "Иван", birthDate: "1995-04-12" });
  expect(parsePastedDetails("ФИО: Примеров Иван Пётр Павлович")).toEqual({});
});
