import { emptyPassport } from "./passport-parser";
import { mergePassportReads, mrzChecksum, readPassportLayout, readRussianMrz, type PassportOcrLine } from "./passport-layout";

function line(text: string, x: number, y: number): PassportOcrLine {
  const bbox = { x0: x, y0: y, x1: x + text.length * 12, y1: y + 20 };
  return { text, confidence: 95, bbox, words: [{ text, confidence: 95, bbox }] };
}
function mrz(birth = "900201", extra = "0100302000000<") {
  const number = "000123456";
  const prefix = number + mrzChecksum(number) + "RUS" + birth + mrzChecksum(birth) + "M<<<<<<<" + extra + mrzChecksum(extra);
  return prefix + mrzChecksum(prefix.slice(0, 10) + prefix.slice(13, 20) + prefix.slice(21));
}
describe("passport layout and checksums (invented fixtures only)", () => {
  it("reads a full spread when tiny captions are missing", () => {
    const lines = [line("ГУ МВД РОССИИ ПО ТЕСТОВОЙ", 300, 300), line("ОБЛАСТИ", 430, 330), line("02.03.2010", 200, 400), line("000-000", 750, 400), line("ПРИМЕРОВ", 600, 700), line("ИВАН", 624, 755), line("ИВАНОВИЧ", 600, 790), line("01.02.1990", 650, 825), line("МУЖ.", 400, 825), line("Г. ПРИМЕР", 580, 860), line("ТЕСТОВАЯ ОБЛАСТЬ", 570, 890)];
    const read = readPassportLayout("identity", lines, lines.map(line => line.text).join("\n"));
    expect(read.data).toMatchObject({ lastName: "Примеров", firstName: "Иван", middleName: "Иванович", birthDate: "1990-02-01", issuedAt: "2010-03-02", divisionCode: "000-000", issuer: "ГУ МВД РОССИИ ПО ТЕСТОВОЙ ОБЛАСТИ", birthPlace: "Г. ПРИМЕР ТЕСТОВАЯ ОБЛАСТЬ" });
  });
  it("does not discard a confident value with an uncertain caption", () => {
    const value = line("ПРИМЕРОВ", 400, 100), caption = line("ФАМИЛИЯ", 100, 100);
    const row = { ...value, confidence: 40, text: "ФАМИЛИЯ ПРИМЕРОВ", words: [{ ...caption.words[0]!, confidence: 10 }, value.words[0]!] };
    expect(readPassportLayout("identity", [row], row.text).data.lastName).toBe("Примеров");
  });
  it("preserves OCR confidence when dates and gender are normalized", () => {
    const read = readPassportLayout("identity", [line("ДАТА РОЖДЕНИЯ", 0, 0), line("01.02.1990", 100, 30), line("МУЖ.", 0, 60)], "");
    expect(read.confidence?.birthDate).toBe(95); expect(read.confidence?.gender).toBe(95);
  });
  it("does not turn a surviving fragment of a caption into a missing patronymic", () => {
    const rows = ["ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990"].map((text, i) => {
      const row = line(text, 0, i * 40);
      return { ...row, confidence: 30, words: text.split(" ").map(text => ({ ...row.words[0]!, text, confidence: 30 })) };
    });
    expect(readPassportLayout("identity", rows, "").data).toEqual(emptyPassport);
  });
  it("does not infer personal names from a partial identity page beside issuance", () => {
    const rows = [line("ПРИМЕРОВ", 600, 700), line("ИВАН", 624, 755), line("ИВАНОВИЧ", 600, 790)];
    const read = readPassportLayout("issuance", rows, "");
    expect(read.data.firstName).toBe(""); expect(read.data.lastName).toBe(""); expect(read.data.middleName).toBe("");
  });
  it("reads abbreviated registration captions and excludes authority/signatures", () => {
    const rows = ["ЗАРЕГИСТРИРОВАН", "Рег.: РЕСП. ПРИМЕРНАЯ", "Пункт: Г. ПРИМЕР", "Улица: УЛ. ТЕСТОВАЯ", "Д. 1, КВ. 2", "ОТДЕЛ ПО ВОПРОСАМ МИГРАЦИИ", "ПОДПИСЬ СОТРУДНИКА"].map((text, i) => line(text, 100, i * 40));
    expect(readPassportLayout("registration", rows, "").data.address).toBe("РЕСП. ПРИМЕРНАЯ, Г. ПРИМЕР, УЛ. ТЕСТОВАЯ, Д. 1, КВ. 2");
  });
  it("validates MRZ groups and composite check digit before using fields", () => {
    expect(mrzChecksum("510509")).toBe("2");
    expect(readRussianMrz(mrz())).toEqual({ series: "0000", number: "123456", birthDate: "1990-02-01", issuedAt: "2010-03-02", gender: "М", divisionCode: "000-000" });
    for (const index of [0, 9, 13, 19, 28, 42, 43]) {
      const row = mrz();
      expect(readRussianMrz(row.slice(0, index) + (row[index] === "0" ? "1" : "0") + row.slice(index + 1))).toBeNull();
    }
    expect(readRussianMrz(mrz().slice(1))).toBeNull();
    expect(readRussianMrz(mrz().replace("RUS", "USA"))).toBeNull();
  });
  it("does not guess the birth century or merge two different valid documents", () => {
    expect(readRussianMrz(mrz("030201"))).not.toHaveProperty("birthDate");
    expect(readRussianMrz("01.02.2003\n" + mrz("030201"))?.birthDate).toBe("2003-02-01");
    expect(readRussianMrz(mrz() + "\n" + mrz("910201"))).toBeNull();
  });
  it("leaves conflicting fields blank instead of silently choosing a pass", () => {
    const read = (lastName: string) => ({ data: { ...emptyPassport, lastName }, warnings: [], mrz: false });
    expect(mergePassportReads([read("Примеров"), read("Другое")])).toMatchObject({ data: { lastName: "" }, conflicts: ["lastName"] });
    expect(mergePassportReads([read("Примеров"), read("ПРИМЕРОВ")]).conflicts).toEqual([]);
  });
  it("flags a low-confidence filled value rather than calling the page fully read", () => {
    const result = mergePassportReads([{ data: { ...emptyPassport, lastName: "Ли" }, warnings: [], mrz: false, confidence: { lastName: 71 } }]);
    expect(result.data.lastName).toBe("Ли"); expect(result.uncertain).toContain("lastName");
  });
  it("uses a confident complete place over the same truncated fragment but not a different place", () => {
    const read = (birthPlace: string, confidence: number) => ({ data: { ...emptyPassport, birthPlace }, warnings: [], mrz: false, confidence: { birthPlace: confidence } });
    expect(mergePassportReads([read("Г. ПРИМЕР", 82), read("Г. ПРИМЕР, ТЕСТОВАЯ ОБЛАСТЬ", 91)]).data.birthPlace).toBe("Г. ПРИМЕР, ТЕСТОВАЯ ОБЛАСТЬ");
    expect(mergePassportReads([read("Г. ДРУГОЙ", 82), read("Г. ПРИМЕР, ТЕСТОВАЯ ОБЛАСТЬ", 91)]).conflicts).toEqual(["birthPlace"]);
  });
  it("gives MRZ precedence only to fields actually checked by that MRZ", () => {
    const base = { ...emptyPassport, birthDate: "2003-02-01", number: "123456" };
    const checked = { data: base, mrz: true, checkedFields: ["number"] as const, warnings: [] };
    const other = { data: { ...base, birthDate: "1903-02-01", number: "654321" }, mrz: false, warnings: [] };
    const result = mergePassportReads([{ ...checked, checkedFields: [...checked.checkedFields] }, other]);
    expect(result.data.number).toBe("123456"); expect(result.conflicts).toEqual(["birthDate"]);
  });
  it("reassembles birthplace rows by geometry instead of sparse OCR column order", () => {
    const rows = [line("ИВАНОВИЧ", 600, 790), line("01.02.1990", 650, 825), line("МЕСТО РОЖДЕНИЯ", 300, 860), line("Г.", 580, 860), line("ТЕСТОВАЯ", 570, 890), line("ПРИМЕР", 630, 860), line("ОБЛАСТЬ", 720, 890)];
    expect(readPassportLayout("identity", rows, "").data.birthPlace).toBe("Г. ПРИМЕР ТЕСТОВАЯ ОБЛАСТЬ");
  });
  it("excludes a separate gender row from the birthplace block", () => {
    const rows = [line("ИВАНОВИЧ", 600, 790), line("01.02.1990", 650, 825), line("МУЖ.", 600, 855), line("Г. ПРИМЕР", 600, 885)];
    expect(readPassportLayout("identity", rows, "").data.birthPlace).toBe("Г. ПРИМЕР");
  });
  it("accepts the observed full place even when its fragment has higher confidence", () => {
    const make = (birthPlace: string, confidence: number) => ({ data: { ...emptyPassport, birthPlace }, warnings: [], mrz: false, confidence: { birthPlace: confidence } });
    expect(mergePassportReads([make("Г. ПРИМЕР ТЕСТОВАЯ ОБЛАСТЬ", 90), make("ТЕСТОВАЯ ОБЛАСТЬ", 96), make("ПРИМЕР ТЕСТОВАЯ ОБЛАСТЬ", 94)]).data.birthPlace).toBe("Г. ПРИМЕР ТЕСТОВАЯ ОБЛАСТЬ");
    expect(mergePassportReads([make("Г. ПРИМЕР", 90), make("Г. ДРУГОЙ", 96)]).conflicts).toEqual(["birthPlace"]);
  });
  it("keeps a corroborated name with a review flag, but never overrides a usable competing name", () => {
    const make = (lastName: string, confidence: number) => ({ data: { ...emptyPassport, lastName }, warnings: [], mrz: false, confidence: { lastName: confidence } });
    const reads = [make("Примеров", 82), make("Примеров", 78)];
    const result = mergePassportReads([...reads, make("Ли", 72)]);
    expect(result.data.lastName).toBe("Примеров"); expect(result.uncertain).toContain("lastName");
    expect(mergePassportReads([...reads, make("Ли", 80)]).conflicts).toContain("lastName");
    expect(mergePassportReads([reads[0]!, make("Ли", 72)]).conflicts).toContain("lastName");
  });
  it("rejects impossible issuance dates even with matching numeric checksums", () => {
    expect(readRussianMrz(mrz("900201", "0100230000000<"))).toBeNull();
    expect(readRussianMrz(mrz("900201", "0910302000000<"))).toBeNull();
  });
});
