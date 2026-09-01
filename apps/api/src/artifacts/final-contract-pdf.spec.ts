import type { FrozenDealSnapshot } from "../deals/deal-version-freeze";
import { renderFinalContractPdf } from "./final-contract-pdf";

describe("renderFinalContractPdf", () => {
  it("creates a multi-section Cyrillic PDF with a QR verification link", async () => {
    const body = await renderFinalContractPdf({
      signatureHash: "a".repeat(64),
      signatures: [
        { displayName: "Иванов Иван Иванович", otpChannel: "MAX_TEST", pepDocumentVersion: "pep-v1", role: "INITIATOR", signedAt: new Date("2026-09-01T12:00:00.000Z") },
        { displayName: "Петрова Анна Сергеевна", otpChannel: "SMSC", pepDocumentVersion: "pep-v1", role: "COUNTERPARTY", signedAt: new Date("2026-09-01T12:01:00.000Z") },
      ],
      snapshot: fixture(),
      verifyUrl: "https://www.max-kontrakt.ru/verify/test-public-code",
    });

    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(10_000);
    expect(body.includes(Buffer.from("test-public-code"))).toBe(true);
  });
});

function fixture(): FrozenDealSnapshot {
  return {
    contract: {
      draft: {
        preamble: "Иванов Иван Иванович, далее Арендодатель, и Петрова Анна Сергеевна, далее Арендатор, заключили настоящий договор.",
        sections: [
          { clauses: ["Арендодатель передаёт, а Арендатор принимает двухкомнатную квартиру.", "Адрес и состояние имущества зафиксированы сторонами."], heading: "Предмет договора" },
          { clauses: ["Срок аренды: с 1 сентября 2026 года по 10 сентября 2026 года.", "Арендная плата составляет 2 000 рублей в сутки."], heading: "Срок и порядок оплаты" },
          { clauses: ["Стороны отвечают за нарушение обязательств в соответствии с законодательством Российской Федерации."], heading: "Ответственность сторон" },
        ],
        title: "Договор аренды имущества",
        warnings: [],
      },
      number: "МК-20260901-ABCDEF12-V1",
    },
    deal: { id: "deal-1", templateSlug: "property-rental", templateTitle: "Аренда имущества", templateVersion: 1, title: "Аренда квартиры", versionId: "version-1", versionNumber: 1 },
    frozenAt: "2026-09-01T11:50:00.000Z",
    parties: [
      { maxUserIdRef: "100", partyId: "party-1", profile: { address: "г. Москва, ул. Примерная, д. 1", birthDate: "1990-01-01", email: "ivan@example.test", firstName: "Иван", lastName: "Иванов", middleName: "Иванович" }, role: "INITIATOR", userId: "user-1", verifiedPhoneRef: "phone-1" },
      { maxUserIdRef: "200", partyId: "party-2", profile: { address: "г. Москва, ул. Тестовая, д. 2", birthDate: "1992-02-02", email: "anna@example.test", firstName: "Анна", lastName: "Петрова", middleName: "Сергеевна" }, role: "COUNTERPARTY", userId: "user-2", verifiedPhoneRef: "phone-2" },
    ],
    schemaVersion: "deal-signature-v1",
    terms: { payment: 2000 },
  };
}
