"use client";

import type { DealIntakeResponse } from "@max-contract/contracts";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/ui/voice-input";
import { suggestDeal } from "@/lib/api/templates";
import { DealRequisites } from "@/components/deals/deal-requisites";

export function DealIntakePanel({ initialDescription = "", isCreating, active = true, onAccept, children }: {
  children?: ReactNode;
  initialDescription?: string;
  isCreating: boolean;
  active?: boolean;
  onAccept: (proposal: DealIntakeResponse) => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const descriptionId = useId();
  const [validationError, setValidationError] = useState("");
  const [requisitesReady, setRequisitesReady] = useState(false);
  const inputRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (initialDescription) {
      inputRef.current?.querySelector("textarea")?.focus();
      inputRef.current?.scrollIntoView({ block: "center" });
    }
  }, [initialDescription]);
  const intake = useMutation({ mutationFn: suggestDeal });
  const proposal = intake.data;
  const busy = intake.isPending || isCreating || Boolean(children);
  return (
    <><Card className="deal-intake-panel">
      <h2><Sparkles size={18} aria-hidden="true" /> Договор по вашему описанию</h2>
      <p>Опишите задачу — ИИ предложит тип договора и перенесёт известные условия в шаблон.</p>
      <label className="form-field" ref={inputRef}>
        <span>Что хотите оформить?</span>
        <Textarea
          id={descriptionId}
          className="deal-description-textarea"
          maxLength={500}
          value={description}
          disabled={busy}
          aria-invalid={Boolean(validationError)}
          onChange={event => { setDescription(event.target.value); setValidationError(""); intake.reset(); }}
          placeholder="Например: нужен договор на подготовку презентации на 10 слайдов за 15 000 рублей…"
        />
        <small className="field-meta">{description.length}/500 · Не указывайте паспорт, телефон и другие личные реквизиты.</small>
      </label>
      <VoiceInput inputId={descriptionId} value={description} disabled={busy || !active} onChange={value => { setDescription(value); setValidationError(""); intake.reset(); }} />
      {validationError ? <p className="field-error" role="alert">{validationError}</p> : null}
      {intake.isError ? <p className="field-error" role="alert">{intake.error.message}</p> : null}
      {!children ? <Button className="full-width" disabled={busy} onClick={() => {
        if (description.trim().length < 10) { setValidationError("Опишите задачу хотя бы в нескольких словах — от 10 символов."); return; }
        intake.mutate({ description: description.trim() });
      }} type="button">
        {intake.isPending ? "ИИ анализирует описание…" : proposal ? "Проанализировать повторно" : "Подобрать договор с ИИ"}
      </Button> : null}
      {proposal ? (
        <section className="deal-intake-result" aria-label="Предложение ИИ" aria-live="polite">
          <strong>{proposal.mode === "INDIVIDUAL" ? "Индивидуальный проект" : proposal.template.title}</strong>
          <p>Основа договора готова. Сначала укажите свои паспортные данные, затем пригласите вторую сторону и уточните условия.</p>
          {proposal.mode === "INDIVIDUAL" ? <p className="deal-intake-warning">Это индивидуальный проект ИИ, а не проверенный шаблон. Проверьте условия перед подписанием.</p> : null}
          {!children ? <div className="inline-deal-requisites">
            <DealRequisites onReadyChange={setRequisitesReady} onSaved={() => undefined} />
            {!requisitesReady ? <p className="field-description">Заполните паспортные данные, чтобы перейти к приглашению.</p> : null}
            <Button className="full-width" disabled={busy || !requisitesReady} onClick={() => onAccept(proposal)} type="button">
              {isCreating ? "Сохраняем…" : "Перейти к приглашению"}
            </Button>
          </div> : null}
        </section>
      ) : null}
    </Card>{children}</>
  );
}
