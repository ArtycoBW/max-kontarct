"use client";

import type { DealIntakeResponse } from "@max-contract/contracts";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/ui/voice-input";
import { suggestDeal } from "@/lib/api/templates";

export function DealIntakePanel({ initialDescription = "", isCreating, active = true, onAccept }: {
  initialDescription?: string;
  isCreating: boolean;
  active?: boolean;
  onAccept: (proposal: DealIntakeResponse) => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const descriptionId = useId();
  const [validationError, setValidationError] = useState("");
  const inputRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (initialDescription) {
      inputRef.current?.querySelector("textarea")?.focus();
      inputRef.current?.scrollIntoView({ block: "center" });
    }
  }, [initialDescription]);
  const intake = useMutation({ mutationFn: suggestDeal });
  const proposal = intake.data;
  const busy = intake.isPending || isCreating;
  return (
    <Card className="deal-intake-panel">
      <h2><Sparkles size={18} aria-hidden="true" /> Договор по вашему описанию</h2>
      <p>Опишите задачу — ИИ предложит тип договора и перенесёт известные условия в анкету. Если шаблона нет, подготовим индивидуальный проект.</p>
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
      <Button className="full-width" disabled={busy} onClick={() => {
        if (description.trim().length < 10) { setValidationError("Опишите задачу хотя бы в нескольких словах — от 10 символов."); return; }
        intake.mutate({ description: description.trim() });
      }} type="button">
        {intake.isPending ? "ИИ анализирует описание…" : proposal ? "Проанализировать повторно" : "Подобрать договор с ИИ"}
      </Button>
      {proposal ? (
        <section className="deal-intake-result" aria-label="Предложение ИИ" aria-live="polite">
          <strong>{proposal.mode === "INDIVIDUAL" ? "Индивидуальный проект" : proposal.template.title}</strong>
          <p>{proposal.reason}</p>
          <p>Название: {proposal.title}</p>
          <dl>
            {Object.entries(proposal.answers).map(([key, value]) => {
              const fields = proposal.template.currentVersion.questionnaireSchema.properties as Record<string, { title?: string; format?: string }>;
              const field = fields[key];
              const formatted = field?.format === "date" && typeof value === "string" ? value.split("-").reverse().join(".") : typeof value === "boolean" ? value ? "Да" : "Нет" : String(value);
              return <div key={key}><dt>{field?.title ?? key}</dt><dd>{formatted}</dd></div>;
            })}
          </dl>
          {!Object.keys(proposal.answers).length ? <p>Недостающие условия можно заполнить на следующем шаге.</p> : null}
          {proposal.warnings.map((warning, index) => <p className="deal-intake-warning" key={index}>{warning}</p>)}
          <p>Это предложение ИИ. Проверьте тип договора и значения: на следующих шагах их можно исправить.</p>
          <Button className="full-width" disabled={busy} onClick={() => onAccept(proposal)} type="button">
            {isCreating ? "Сохраняем…" : "Проверить и продолжить"}
          </Button>
        </section>
      ) : null}
    </Card>
  );
}
