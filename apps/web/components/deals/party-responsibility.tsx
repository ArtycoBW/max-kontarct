"use client";
import type { DealPartyRole } from "@max-contract/contracts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subjectRoleLabels } from "@/lib/deals/party-responsibility";

export function PartyResponsibility({ slug, value, onChange }: { slug: string; value: DealPartyRole | null; onChange: (value: DealPartyRole) => void }) {
  const [supplier, customer] = subjectRoleLabels(slug);
  return <div className="form-field">
    <label htmlFor="subject-party">Ваша роль в сделке</label>
    <Select value={value ?? ""} onValueChange={next => { if (next === "INITIATOR" || next === "COUNTERPARTY") onChange(next); }}>
      <SelectTrigger id="subject-party" aria-label="Ваша роль в сделке"><SelectValue placeholder="Выберите свою роль" /></SelectTrigger>
      <SelectContent><SelectItem value="INITIATOR">{supplier}</SelectItem><SelectItem value="COUNTERPARTY">{customer}</SelectItem></SelectContent>
    </Select>
    <span className="field-description">Сторона, передающая имущество или результат, загружает материалы сделки. Вторая сторона их просматривает. Каждая заполняет собственные реквизиты.</span>
  </div>;
}
