import type { ConceptDefinition, ConceptSlug } from "@/lib/types";

export const CONCEPTS: ConceptDefinition[] = [
  {
    slug: "jeton",
    number: "01",
    name: "Редакционный",
    label: "Финансовая редактура",
    character: "Редакционно · Ясно · Энергично",
    summary: "Белое поле с тёплой типографикой и сигнальным оранжевым.",
    detail: "Асимметричная типографическая композиция, крупные числовые акценты и минимум контейнеров. Сигнальный оранжевый отмечает только решения и активные состояния.",
    primary: "#f73b20",
    background: "#ffffff",
    preview: "/references/01-jeton/01-onboarding-dashboard.png",
    references: [
      "01-onboarding-dashboard.png",
      "02-deal-creation.png",
      "03-invitation-states.png",
      "04-documents-verification.png",
      "05-contract-signing.png",
      "06-completion-profile.png",
    ],
  },
  {
    slug: "caldera",
    number: "02",
    name: "Продуктовый",
    label: "Современное рабочее пространство",
    character: "Компактно · Ясно · Собранно",
    summary: "Светлая продуктовая система с точной информационной плотностью.",
    detail: "Тонкие границы, компактные карточки и спокойная синяя иерархия. Интерфейс ощущается как зрелый рабочий продукт: статусы читаются быстро, а действия не спорят с содержанием.",
    primary: "#2563eb",
    background: "#f7f7f8",
    preview: "/references/02-caldera/00-product-workspace-reference.svg",
    references: [
      "00-product-workspace-reference.svg",
    ],
  },
  {
    slug: "contractbook",
    number: "03",
    name: "Банковский",
    label: "Сдержанный банковский интерфейс",
    character: "Тихо · Точно · Премиально",
    summary: "Тёмное банковское пространство с графитовыми панелями и одним синим действием.",
    detail: "Глубокий тёмный фон, плоские графитовые карточки и спокойная широкая типографика. Синий используется только для главного действия, а навигация собрана в отдельную плавающую панель.",
    primary: "#5266eb",
    background: "#171721",
    preview: "/references/03-contractbook/00-mercury-reference.svg",
    references: [
      "00-mercury-reference.svg",
    ],
  },
  {
    slug: "auros",
    number: "04",
    name: "Премиальный",
    label: "Тёплая редакционная система",
    character: "Спокойно · Тактильно · Уверенно",
    summary: "Тёплая бумага, выразительная антиква и мягкие формы.",
    detail: "Редакционная типографика соединена с деликатными персиковыми поверхностями и округлыми карточками. Система выглядит серьёзно, но не холодно, и подчёркивает ценность документа.",
    primary: "#3d241b",
    background: "#f6f0e9",
    preview: "/references/04-auros/00-warm-editorial-reference.svg",
    references: [
      "00-warm-editorial-reference.svg",
    ],
  },
];

export const CONCEPT_SLUGS = CONCEPTS.map((concept) => concept.slug);

export function getConcept(slug: string): ConceptDefinition | undefined {
  return CONCEPTS.find((concept) => concept.slug === slug);
}

export function isConceptSlug(slug: string): slug is ConceptSlug {
  return CONCEPT_SLUGS.includes(slug as ConceptSlug);
}
