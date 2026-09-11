import { emptyPassport } from "./passport-parser";
import { activeReviewIssues, buildPassportReview, issueDescription, pageReadComplete } from "./passport-review";

describe("structured passport review", () => {
  it("keeps retrying when only the headline fields have been recognized", () => {
    const data = { ...emptyPassport, firstName: "Иван", lastName: "Примеров", birthDate: "1990-02-01", series: "0000", number: "123456" };
    expect(pageReadComplete("identity", data)).toBe(false);
    expect(pageReadComplete("identity", { ...data, birthPlace: "Г. ПРИМЕР", gender: "М" })).toBe(false);
    expect(pageReadComplete("identity", { ...data, middleName: "Иванович", birthPlace: "Г. ПРИМЕР", gender: "М" })).toBe(true);
    expect(pageReadComplete("identity", { ...data, middleName: "Иванович", birthPlace: "Г. ПРИМЕР", gender: "М" }, { lastName: 71 })).toBe(false);
  });
  it("reports one issue per field, scoped to supplied pages", () => {
    const review = buildPassportReview({ ...emptyPassport }, ["registration"], ["address"], ["address"]);
    expect(review.expected).toEqual(["address"]);
    expect(review.issues).toEqual([{ field: "address", code: "conflict" }]);
  });
  it("treats patronymic as optional and includes issuance data from a spread", () => {
    const review = buildPassportReview({ ...emptyPassport, issuer: "ТЕСТОВЫЙ ОТДЕЛ" }, ["identity"], []);
    expect(review.expected).toContain("issuer");
    expect(review.issues.some(issue => issue.field === "middleName")).toBe(false);
  });
  it("keeps a partial address instead of confusing it with a failed photo", () => {
    const review = buildPassportReview({ ...emptyPassport, address: "Г. ПРИМЕР" }, ["registration"], []);
    expect(review.issues).toEqual([{ field: "address", code: "partial" }]);
    expect(issueDescription(review.issues[0]!)).toMatch(/Дополните/);
  });
  it("clears a corrected issue but restores it if the value is erased", () => {
    const review = buildPassportReview({ ...emptyPassport }, ["registration"], ["address"]);
    expect(activeReviewIssues({ ...emptyPassport, address: "Г. ПРИМЕР, Д. 1" }, review, ["address"])).toEqual([]);
    expect(activeReviewIssues(emptyPassport, review, ["address"])).toEqual([{ field: "address", code: "missing" }]);
  });
  it("does not dismiss an invalid passport number on the first typed digit", () => {
    const review = { expected: ["number"] as const, issues: [] };
    expect(activeReviewIssues({ ...emptyPassport, number: "1" }, { ...review, expected: [...review.expected] }, ["number"])).toEqual([{ field: "number", code: "invalid" }]);
    expect(activeReviewIssues({ ...emptyPassport, number: "123456" }, { ...review, expected: [...review.expected] }, ["number"])).toEqual([]);
  });
});
