import type {
  AiClarificationQuestion,
  ContractStructuredDraft,
} from "@max-contract/contracts";

type ObjectValue = Record<string, unknown>;
const termLabels: Record<string, string> = {
  termsLocation: "Место исполнения",
  termsProperty: "Идентификация имущества",
  termsPayment: "Порядок оплаты",
  termsAcceptance: "Порядок передачи и приёмки",
  termsMaterials: "Материалы и расходы",
  termsUtilities: "Коммунальные расходы",
  termsDeposit: "Возврат обеспечительного платежа",
  termsPaymentMethod: "Способ оплаты",
  termsLoanTransfer: "Передача суммы займа",
  termsLoanRepayment: "Порядок возврата займа",
  termsInterest: "Уплата процентов",
};
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};

/** Deterministic source terms: an AI omission must never remove a confirmed amount, date or answer. */
export function confirmedContractTerms(
  schema: unknown,
  input: ObjectValue,
  answers: ObjectValue,
  history: AiClarificationQuestion[],
): string[] {
  const properties = object(object(schema).properties);
  const replacements: Record<string, string> = {
    workLocation: "termsLocation",
    serviceLocation: "termsLocation",
    transferLocation: "termsLocation",
    paymentProcedure: "termsPayment",
    paymentMethod: "termsPaymentMethod",
  };
  const terms: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    if (replacements[key] && answers[replacements[key]]) continue;
    if (key === "interestRate" && input.interestType === "Беспроцентный")
      continue;
    const field = object(properties[key]);
    if (typeof field.title !== "string" || !field.title.trim())
      throw new Error("CONTRACT_FIELD_LABEL_MISSING");
    terms.push(`${field.title}: ${display(value, field.format === "date")}.`);
  }
  for (const [key, value] of Object.entries(answers)) {
    const question = history.find((item) => item.id === key);
    if (!question) throw new Error("CONTRACT_ANSWER_LABEL_MISSING");
    const label = question.options.find(
      (option) => option.value === value,
    )?.label;
    terms.push(
      `${termLabels[key] ?? question.label.replace(/\?$/, "")}: ${label ?? display(value, question.type === "date")}.`,
    );
  }
  return terms;
}

export function withConfirmedContractTerms(
  draft: ContractStructuredDraft,
  terms: string[],
): ContractStructuredDraft {
  if (!terms.length) return draft;
  const sections: ContractStructuredDraft["sections"] = [];
  for (let offset = 0; offset < terms.length; offset += 20) {
    sections.push({
      heading: offset ? "Условия сделки (продолжение)" : "Условия сделки",
      clauses: terms.slice(offset, offset + 20),
    });
  }
  return { ...draft, sections: [...sections, ...draft.sections] };
}

function display(value: unknown, date: boolean): string {
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number")
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 10 }).format(
      value,
    );
  if (typeof value !== "string")
    throw new Error("CONTRACT_FIELD_VALUE_INVALID");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split("-").reverse().join(".");
  return value;
}
