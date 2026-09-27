import type { ContractStructuredDraft } from "@max-contract/contracts";
import { BadRequestException } from "@nestjs/common";
import { missingContractTerms, normalizeTerm } from "../templates/contract-completeness";

/** Local completeness checks only. Do not transmit edited text or personal details to AI. */
export function validateManualContract(value: unknown, slug: string, names: string[]): ContractStructuredDraft {
  const errors: Array<{ path: string; message: string }> = [];
  const object = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item));
  const fail = () => { throw new BadRequestException({ code: "CONTRACT_REVISION_INVALID", message: "Исправьте отмеченные условия договора", details: { errors } }); };
  const text = (item: unknown, path: string, label: string, max = 12000): string => {
    if (typeof item !== "string" || !item.trim() || item.length > max) {
      errors.push({ path, message: `${label}: укажите текст (до ${max} символов).` });
      return "";
    }
    if (/_{3,}|\{\{|\[(?:укажите|вставьте|заполните)[^\]]*\]/iu.test(item)) errors.push({ path, message: `${label}: заполните пропущенные значения.` });
    return item.trim();
  };
  if (!object(value) || JSON.stringify(value).length > 100000) { errors.push({ path: "contractDraft", message: "Договор должен содержать не более 100 000 символов." }); return fail(); }
  const draft: ContractStructuredDraft = { title: text(value.title, "title", "Название", 500), preamble: text(value.preamble, "preamble", "Вступление"), sections: [], warnings: [] };
  if (!Array.isArray(value.sections) || !value.sections.length || value.sections.length > 50) { errors.push({ path: "sections", message: "Добавьте от 1 до 50 разделов договора." }); return fail(); }
  value.sections.forEach((section: unknown, i: number) => {
    if (!object(section) || !Array.isArray(section.clauses) || !section.clauses.length || section.clauses.length > 100) { errors.push({ path: `sections.${i}`, message: `Раздел ${i + 1}: добавьте пункты договора (до 100).` }); return; }
    draft.sections.push({ heading: text(section.heading, `sections.${i}.heading`, `Заголовок раздела ${i + 1}`, 500), clauses: section.clauses.map((clause: unknown, j: number) => text(clause, `sections.${i}.clauses.${j}`, `Раздел ${i + 1}, пункт ${j + 1}`)) });
  });
  if (errors.length) return fail();
  const paragraphs = [draft.preamble, ...draft.sections.flatMap(section => section.clauses)];
  const all = normalizeTerm(paragraphs.join(" "));
  if (names.some(name => !all.includes(normalizeTerm(name)))) errors.push({ path: "preamble", message: "Укажите полные ФИО обеих сторон из их профилей. Реквизиты меняются в профиле, а не заменой участника в тексте." });
  // Validate only the edited text, never satisfy missing terms with stale questionnaire answers.
  for (const question of missingContractTerms(slug, Object.fromEntries(paragraphs.map((paragraph, i) => [`paragraph${i}`, paragraph])))) errors.push({ path: "sections", message: `${question.label} ${question.description}` });
  const monetary = ["paid-services", "work-contract", "movable-property-sale", "property-rental", "personal-loan"].includes(slug);
  if (monetary && !/(?:\d[\d\s.,]*\s*(?:руб|₽|доллар|евро|usd|eur)|безвозмездн)/iu.test(all)) errors.push({ path: "sections", message: "Укажите сумму и валюту договора либо явно укажите безвозмездность." });
  if (errors.length) return fail();
  return draft;
}
