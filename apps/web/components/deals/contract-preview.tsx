import type { ContractStructuredDraft } from "@max-contract/contracts";
import { Card } from "@/components/ui/card";

export function ContractPreview({ draft }: { draft: ContractStructuredDraft }) {
  return <Card className="deal-contract-preview" role="region" aria-label="Текст договора" tabIndex={0}>
    <strong>{draft.title}</strong>
    <p>{draft.preamble}</p>
    {draft.sections.map((section, index) => <div key={`${index}-${section.heading}`}>
      <h3>{section.heading}</h3>
      {section.clauses.map((clause, clauseIndex) => <p key={clauseIndex}>{clause}</p>)}
    </div>)}
    {draft.warnings.length ? <div className="form-message is-warning"><strong>Обратите внимание</strong>{draft.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div> : null}
  </Card>;
}
