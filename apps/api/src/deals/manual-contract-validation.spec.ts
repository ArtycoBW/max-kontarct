import { validateManualContract } from "./manual-contract-validation";

export const editedContract = {
  title: "Купля-продажа ноутбука", preamble: "Продавец Иванов Иван Иванович и покупатель Петров Пётр Петрович заключили договор.", warnings: [],
  sections: [{ heading: "Условия сделки", clauses: [
    "Продавец передаёт покупателю ноутбук модели А, серийный номер 12345.",
    "Стоимость 15000 рублей. Оплата при встрече, без аванса.",
    "Передача по адресу: г. Москва, ул. Примерная, д. 10.",
    "Покупатель проверяет и подтверждает приёмку на месте при встрече.",
  ] }],
};
const names = ["Иванов Иван Иванович", "Петров Пётр Петрович"];
describe("manual contract validation", () => {
  it("preserves the edited text instead of regenerating it", () => expect(validateManualContract(editedContract, "movable-property-sale", names)).toEqual(editedContract));
  it.each([null, {}, { ...editedContract, sections: [] }, { ...editedContract, preamble: "___" }, { ...editedContract, sections: [{ heading: "Условия", clauses: ["Потом договоримся"] }] }])("rejects incomplete text %j", value => {
    expect(() => validateManualContract(value, "movable-property-sale", names)).toThrow();
  });
  it("does not allow replacement of profile identities", () => expect(() => validateManualContract(editedContract, "movable-property-sale", ["Другой Участник"])).toThrow());
  it("cannot satisfy missing payment from stale answers", () => {
    const value = { ...editedContract, sections: [{ ...editedContract.sections[0]!, clauses: editedContract.sections[0]!.clauses.filter(clause => !clause.includes("Стоимость")) }] };
    expect(() => validateManualContract(value, "movable-property-sale", names)).toThrow();
  });
});
