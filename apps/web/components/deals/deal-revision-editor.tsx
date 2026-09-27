"use client";
import type { ContractStructuredDraft, DealWorkspaceResponse } from "@max-contract/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { editContractVersion } from "@/lib/api/deals";
import { ApiError } from "@/lib/api/client";

export function DealRevisionEditor({ deal, onSaved }: { deal: DealWorkspaceResponse; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(deal);
  return <Dialog open={open} onOpenChange={next => { if (next) setSource(deal); setOpen(next); }}>
    <DialogTrigger asChild><Button variant="secondary" className="full-width">Редактировать договор</Button></DialogTrigger>
    <DialogContent className="app-modal contract-editor-dialog">
      <DialogHeader className="app-modal-header is-stacked"><DialogTitle>Редактирование договора</DialogTitle><DialogDescription>Измените итоговый текст. После сохранения обе стороны согласуют новую версию; предыдущие останутся в истории.</DialogDescription></DialogHeader>
      <div className="app-modal-body"><RevisionForm key={`${source.versionId}-${open}`} deal={source} onSaved={() => { setOpen(false); onSaved(); }} /></div>
    </DialogContent>
  </Dialog>;
}

function RevisionForm({ deal, onSaved }: { deal: DealWorkspaceResponse; onSaved: () => void }) {
  const [draft, setDraft] = useState<ContractStructuredDraft | null>(deal.contractDraft);
  const [summary, setSummary] = useState("");
  const save = useMutation({ mutationFn: () => {
    if (!draft) throw new Error("Договор ещё не сформирован");
    if (summary.trim().length < 3) throw new Error("Кратко опишите, что изменилось");
    return editContractVersion(deal.id, { contractDraft: draft, changeSummary: summary.trim(), expectedVersionId: deal.versionId, expectedUpdatedAt: deal.updatedAt });
  }, onSuccess: onSaved });
  const details = save.error instanceof ApiError ? save.error.details : null;
  const errors = details && typeof details === "object" && "errors" in details && Array.isArray(details.errors) ? details.errors as Array<{ path: string; message: string }> : [];
  if (!draft) return <p>Сначала сформируйте договор.</p>;
  const change = (next: ContractStructuredDraft) => { setDraft(next); save.reset(); };
  return <fieldset className="revision-form" disabled={save.isPending}>
    <label className="form-field">Название договора<Input value={draft.title} maxLength={500} onChange={e => change({ ...draft, title: e.target.value })} /></label>
    <label className="form-field">Вступление<Textarea aria-label="Вступление" rows={5} maxLength={12000} value={draft.preamble} onChange={e => change({ ...draft, preamble: e.target.value })} /></label>
    {draft.sections.map((section, i) => <section className="contract-editor-section" key={i}>
      <label className="form-field">Раздел {i + 1}<Input aria-label={`Заголовок раздела ${i + 1}`} value={section.heading} maxLength={500} onChange={e => change({ ...draft, sections: draft.sections.map((item, index) => index === i ? { ...item, heading: e.target.value } : item) })} /></label>
      {section.clauses.map((clause, j) => <label className="form-field" key={j}>Пункт {i + 1}.{j + 1}<Textarea aria-label={`Пункт ${i + 1}.${j + 1}`} rows={5} maxLength={12000} value={clause} onChange={e => change({ ...draft, sections: draft.sections.map((item, index) => index === i ? { ...item, clauses: item.clauses.map((value, ci) => ci === j ? e.target.value : value) } : item) })} /></label>)}
      <Button variant="ghost" type="button" onClick={() => change({ ...draft, sections: draft.sections.map((item, index) => index === i ? { ...item, clauses: [...item.clauses, ""] } : item) })}>Добавить пункт</Button>
    </section>)}
    <label className="form-field">Что изменилось<Input value={summary} maxLength={500} onChange={e => setSummary(e.target.value)} placeholder="Например, срок передачи и порядок оплаты" /></label>
    <p className="field-description">Проверим заполнение и основные условия. Это не юридическая экспертиза: обеим сторонам нужно прочитать весь текст.</p>
    {save.error ? <div role="alert" className="form-message is-error"><strong>{save.error.message}</strong>{errors.length ? <ul>{errors.map((error, i) => <li key={i}>{error.message}</li>)}</ul> : null}</div> : null}
    <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Проверяем и сохраняем…" : "Проверить и сохранить новую версию"}</Button>
  </fieldset>;
}
