import { emptyPassport, parsePassportPages, passportDate } from "./passport-parser";
import { validatePassportPhoto } from "./passport-ocr";

describe("passport OCR extraction (synthetic data only)", () => {
  it("extracts printed labels from three distinct pages", () => {
    const { data } = parsePassportPages({
      identity: "ФАМИЛИЯ\nПРИМЕРОВ\nИМЯ ИВАН\nОТЧЕСТВО ИВАНОВИЧ\nПОЛ МУЖ.\nДАТА\nРОЖДЕНИЯ 01. 02. 1990\nМЕСТО РОЖДЕНИЯ\nГ. МОСКВА\nСЕРИЯ НОМЕР\n00 00 000000",
      issuance: "ПАСПОРТ ВЫДАН\nТЕСТОВЫМ ОТДЕЛОМ\nПО ГОРОДУ ПРИМЕРУ\nДАТА ВЫДАЧИ 02.03.2010\nКОД ПОДРАЗДЕЛЕНИЯ 000-000\n00 00 000000",
      registration: "ЗАРЕГИСТРИРОВАН\nГ. ПРИМЕР\nУЛ. ТЕСТОВАЯ, Д. 1, КВ. 2\nПОДПИСЬ СОТРУДНИКА",
    });
    expect(data).toEqual({ firstName: "Иван", lastName: "Примеров", middleName: "Иванович", birthDate: "1990-02-01", birthPlace: "Г. МОСКВА", gender: "М", series: "0000", number: "000000", issuedAt: "2010-03-02", issuer: "ТЕСТОВЫМ ОТДЕЛОМ ПО ГОРОДУ ПРИМЕРУ", divisionCode: "000-000", address: "Г. ПРИМЕР, УЛ. ТЕСТОВАЯ, Д. 1, КВ. 2" });
  });
  it("does not substitute labels or noise for missing names", () => {
    expect(parsePassportPages({ identity: "ФАМИЛИЯ\nИМЯ\nОТЧЕСТВО\nДАТА РОЖДЕНИЯ\nnoise 42" }).data).toEqual(emptyPassport);
  });
  it("does not guess among multiple passport numbers or registration stamps", () => {
    const result = parsePassportPages({ identity: "00 00 000000\n11 11 111111", registration: "ЗАРЕГИСТРИРОВАН\nГ. ПРИМЕР\nЗАРЕГИСТРИРОВАН\nГ. ДРУГОЙ" });
    expect(result.data.series).toBe(""); expect(result.data.address).toBe("");
    expect(result.warnings.join(" ")).toMatch(/разные номера/);
    expect(parsePassportPages({ registration: "Г. ПРИМЕР\nСНЯТ С УЧЁТА" }).data.address).toBe("");
  });
  it.each(["31.02.2000", "29.02.2001", "00.01.1990", "01.13.1990", "01.01.1890", "01.01.2099", "ничего"])('rejects invalid date %s', date => expect(passportDate(date)).toBe(""));
  it("accepts a real leap date and separate OCR spacing", () => expect(passportDate("29. 02. 2000")).toBe("2000-02-29"));
  it("reports unreadable registration rather than inventing an address", () => {
    const result = parsePassportPages({ registration: "" });
    expect(result.data.address).toBe(""); expect(result.warnings.join(" ")).toMatch(/рукописные/);
  });
  it("validates size and type before starting a worker", () => {
    expect(() => validatePassportPhoto({ type: "image/jpeg", size: 1234 })).not.toThrow();
    expect(() => validatePassportPhoto({ type: "application/pdf", size: 1234 })).toThrow(/JPG/);
    expect(() => validatePassportPhoto({ type: "image/png", size: 0 })).toThrow(/пустой/);
    expect(() => validatePassportPhoto({ type: "image/png", size: 13 * 1024 * 1024 })).toThrow(/12 МБ/);
  });
});
