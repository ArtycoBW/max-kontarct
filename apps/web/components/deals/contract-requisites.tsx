import type { DealWorkspaceResponse } from "@max-contract/contracts";

export function ContractRequisites({ value }: { value: DealWorkspaceResponse["requisites"] }) {
  if (!value) return null;
  return <section className="contract-requisites"><h3>Реквизиты сторон</h3>
    <p className="field-description">{value.frozen ? "Эти данные зафиксированы для текущей версии. Изменения профиля не меняют согласованный договор." : "Проверьте данные из профилей. Они войдут в итоговый договор и будут видны обеим сторонам. Исправления вносятся в профиле до согласования."}</p>
    {value.parties.map(party => <section key={party.role}><h4>{party.fullName}</h4><dl>
      {Object.entries({ "Дата рождения": party.birthDate, "Паспорт": [party.passport?.series, party.passport?.number].filter(Boolean).join(" "), "Дата выдачи": party.passport?.issuedAt, "Кем выдан": party.passport?.issuer, "Код подразделения": party.passport?.divisionCode, "Место рождения": party.passport?.birthPlace, "Пол": party.passport?.gender, "Адрес регистрации": party.address, "Телефон": party.phone, "Электронная почта": party.email }).map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text || "Не указано"}</dd></div>)}
    </dl></section>)}
  </section>;
}
