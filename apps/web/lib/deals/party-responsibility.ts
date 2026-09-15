import type { DealPartyRole } from "@max-contract/contracts";

export function subjectRoleLabels(slug: string): [string, string] {
  switch (slug) {
    case "movable-property-sale": return ["Продавец", "Покупатель"];
    case "property-rental": return ["Арендодатель", "Арендатор"];
    case "work-contract": case "paid-services": return ["Исполнитель", "Заказчик"];
    case "personal-loan": return ["Займодавец", "Заёмщик"];
    default: return ["Передаёт предмет или результат", "Принимает предмет или результат"];
  }
}

export function participantRoleLabel(slug: string, responsible: DealPartyRole | null | undefined, party: DealPartyRole): string {
  if (!responsible) return party === "INITIATOR" ? "Инициатор" : "Вторая сторона";
  return subjectRoleLabels(slug)[party === responsible ? 0 : 1];
}
