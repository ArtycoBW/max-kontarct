"use client";
import type { AiClarificationQuestion, AiClarificationSessionResponse, DealWorkspaceResponse } from "@max-contract/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseQuestionnaireSchema, TemplateQuestionnaire } from "@/components/templates/template-questionnaire";
import { normalizeQuestionnaireAnswers } from "@/lib/validation/questionnaire-answers";
import { answerAiClarification, getContractGeneration, getTemplate, startAiClarification, startContractGeneration, validateTemplateAnswers } from "@/lib/api/templates";
import { createDealVersion } from "@/lib/api/deals";
import { getDealWorkspace } from "@/lib/api/invitations";
import { ApiError } from "@/lib/api/client";
import { fieldExample } from "@/lib/validation/field-examples";

export function DealRevisionEditor({ deal, onSaved }: { deal: DealWorkspaceResponse; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<DealWorkspaceResponse | null>(null);
  // Background refreshes must not reset an in-progress edit to somebody else's revision.
  const changeOpen = (next: boolean) => { if (next) setSource(deal); setOpen(next); };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><Button variant="secondary" className="full-width">Изменить условия договора</Button></DialogTrigger><DialogContent className="app-modal"><DialogHeader className="app-modal-header is-stacked"><DialogTitle>Новая редакция договора</DialogTitle><DialogDescription>После сохранения обе стороны согласуют договор заново. Текущая и предыдущие версии сохранятся в истории.</DialogDescription></DialogHeader><div className="app-modal-body"><RevisionForm key={source?.versionId ?? deal.versionId} deal={source ?? deal} onSaved={() => { setOpen(false); onSaved(); }} /></div></DialogContent></Dialog>;
}

function RevisionForm({ deal, onSaved }: { deal: DealWorkspaceResponse; onSaved: () => void }) {
  const [answers, setAnswers] = useState(deal.draft.answers);
  const [description, setDescription] = useState(deal.draft.description);
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [session, setSession] = useState<AiClarificationSessionResponse | null>(null);
  const [clarifications, setClarifications] = useState<Record<string, unknown>>({});
  const [generationId, setGenerationId] = useState<string | null>(null);
  const template = useQuery({ queryKey: ["revision-template", deal.template.slug], queryFn: () => getTemplate(deal.template.slug) });
  const definition = template.data ? parseQuestionnaireSchema(template.data.currentVersion.questionnaireSchema) : null;
  const generation = useQuery({ queryKey: ["revision-generation", generationId], enabled: Boolean(generationId && session), queryFn: () => getContractGeneration(deal.template.slug, session!.id), refetchInterval: query => ["COMPLETED", "FAILED"].includes(query.state.data?.status ?? "") ? false : 1500 });
  const run = useMutation({
    mutationFn: async () => {
      setErrors({});
      if (summary.trim().length < 3) throw new Error("Кратко опишите, что меняется, минимум в трёх символах");
      if (description.trim().length < 10) throw new Error("Опишите сделку хотя бы в нескольких словах");
      if (!definition || !template.data) throw new Error("Дождитесь загрузки анкеты");
      let next: AiClarificationSessionResponse;
      if (session?.status === "NEED_MORE_INFO") {
        const values = Object.fromEntries(session.questions.filter(question => clarifications[question.id] !== undefined).map(question => [question.id, clarifications[question.id]]));
        const invalid: Record<string, string> = {};
        for (const question of session.questions) {
          if (question.type !== "number" || values[question.id] === undefined) continue;
          const value = String(values[question.id]).trim().replace(",", ".");
          if (!value || !Number.isFinite(Number(value))) invalid[question.id] = "Введите число, например 15000 или 15000,50";
          else values[question.id] = Number(value);
        }
        if (Object.keys(invalid).length) { setErrors(invalid); throw new Error("Проверьте отмеченные поля"); }
        next = await answerAiClarification(deal.template.slug, session.id, { answers: values });
      } else if (session?.status === "READY_TO_GENERATE") {
        next = session;
      } else {
        const normalized = normalizeQuestionnaireAnswers(definition, answers);
        if (Object.keys(normalized.errors).length) { setErrors(normalized.errors); throw new Error("Проверьте отмеченные поля"); }
        const validated = await validateTemplateAnswers(deal.template.slug, { answers: normalized.answers, templateVersionId: deal.template.versionId });
        setAnswers(validated.answers);
        next = await startAiClarification(deal.template.slug, { answers: validated.answers, description, templateVersionId: deal.template.versionId, subjectDocumentsParty: deal.draft.subjectDocumentsParty });
        // Prefill matching earlier answers for review; never auto-submit old terms.
        if (deal.draft.clarificationSessionId && next.status === "NEED_MORE_INFO") {
          const previous = await getContractGeneration(deal.template.slug, deal.draft.clarificationSessionId).catch(() => null);
          const confirmed = previous?.clarificationAnswers ?? {};
          setClarifications(Object.fromEntries(next.questions.filter(q => confirmed[q.id] !== undefined).map(q => [q.id, confirmed[q.id]])));
        }
      }
      setSession(next);
      if (next.status === "READY_TO_GENERATE") {
        const started = await startContractGeneration(deal.template.slug, next.id);
        setGenerationId(started.id);
      }
    },
    onError: error => {
      if (error instanceof ApiError && error.details && typeof error.details === "object" && "errors" in error.details && Array.isArray(error.details.errors)) {
        const fields: Record<string, string> = {};
        for (const item of error.details.errors as Array<{ path?: unknown; message?: unknown }>) if (typeof item.path === "string" && typeof item.message === "string") fields[item.path] = item.message;
        setErrors(fields);
      }
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!generation.data || generation.data.status !== "COMPLETED" || !session) throw new Error("Дождитесь проекта договора");
      const current = await getDealWorkspace(deal.id);
      if (current.versionId !== deal.versionId) throw new Error("Уже появилась другая редакция. Закройте окно и откройте актуальную версию.");
      await createDealVersion(deal.id, { answers, description, changeSummary: summary.trim(), clarificationSessionId: session.id, sourceGenerationId: generation.data.id, expectedVersionId: deal.versionId, expectedUpdatedAt: current.updatedAt });
    }, onSuccess: onSaved,
  });
  const editing = !session && !generationId;
  return <fieldset className="revision-form" disabled={run.isPending || save.isPending}>
    <label className="form-field">Что меняется<Input aria-label="Что меняется" maxLength={500} value={summary} disabled={Boolean(generationId) || run.isPending} onChange={e => setSummary(e.target.value)} /></label>
    {editing ? <>
      <label className="form-field">Описание сделки<Textarea aria-label="Описание сделки для новой редакции" maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /></label>
      {definition ? <TemplateQuestionnaire definition={definition} answers={answers} errors={errors} onChange={(key, value) => setAnswers(previous => ({ ...previous, [key]: value }))} /> : <p>{template.error ? <>Не удалось загрузить анкету. <Button variant="ghost" onClick={() => void template.refetch()}>Повторить</Button></> : "Загружаем анкету…"}</p>}
    </> : null}
    {session?.status === "NEED_MORE_INFO" ? session.questions.map(question => <Card key={question.id} className="revision-question"><label htmlFor={`revision-${question.id}`}>{question.label}</label><p className="field-description">{question.description}</p><RevisionQuestion question={question} value={clarifications[question.id]} onChange={value => setClarifications(old => ({ ...old, [question.id]: value }))} />{errors[question.id] ? <p role="alert" className="field-error">{errors[question.id]}</p> : null}</Card>) : null}
    {!generationId ? <Button disabled={run.isPending || !definition} onClick={() => run.mutate()}>{run.isPending ? "Проверяем условия…" : session ? "Продолжить подготовку" : "Подготовить новую редакцию"}</Button> : null}
    {generationId && generation.data?.status !== "COMPLETED" ? <p role="status">{generation.error || generation.data?.status === "FAILED" ? "Не удалось подготовить проект. Вернитесь к редактированию и повторите." : "Готовим проект новой редакции…"}</p> : null}
    {generation.data?.draft ? <Card className="deal-contract-preview"><h3>{generation.data.draft.title}</h3><p>{generation.data.draft.preamble}</p>{generation.data.draft.sections.map((section, i) => <section key={i}><h4>{section.heading}</h4>{section.clauses.map((clause, j) => <p key={j}>{clause}</p>)}</section>)}<Button disabled={save.isPending} onClick={() => save.mutate()}>Сохранить новую редакцию</Button></Card> : null}
    {(run.error || save.error) ? <p role="alert" className="field-error">{(save.error ?? run.error)?.message}</p> : null}
    {session || generationId ? <Button variant="ghost" disabled={save.isPending || run.isPending} onClick={() => { setSession(null); setGenerationId(null); run.reset(); save.reset(); }}>Вернуться к редактированию</Button> : null}
  </fieldset>;
}

function RevisionQuestion({ question, value, onChange }: { question: AiClarificationQuestion; value: unknown; onChange: (value: unknown) => void }) {
  const id = `revision-${question.id}`;
  if (question.type === "single_choice" || question.type === "boolean") {
    const options = question.type === "boolean" ? [{ value: "true", label: "Да" }, { value: "false", label: "Нет" }] : question.options;
    return <Select value={value === undefined ? "" : String(value)} onValueChange={next => onChange(question.type === "boolean" ? next === "true" : next)}><SelectTrigger id={id} aria-label={question.label}><SelectValue placeholder="Выберите ответ" /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
  }
  if (question.type === "date") return <DatePicker id={id} allowFuture value={typeof value === "string" ? value : ""} onChange={onChange} />;
  if (question.type === "number") return <Input id={id} aria-label={question.label} inputMode="decimal" value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)} />;
  return <><Textarea id={id} aria-label={question.label} placeholder={fieldExample(question.id) ?? "Введите ответ"} value={typeof value === "string" ? value : ""} maxLength={1000} onChange={e => onChange(e.target.value)} />{fieldExample(question.id) ? <p className="field-description">Пример: {fieldExample(question.id)}</p> : null}</>;
}
