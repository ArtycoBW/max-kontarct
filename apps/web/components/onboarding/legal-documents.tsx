"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useRef } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type LegalDocument = { type: string; title: string; version: string; status: "DRAFT"; paragraphs: string[] };

export function LegalDocuments({ type, label = "Документы и согласия" }: { type?: string; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const documents = useQuery({
    queryKey: ["legal-documents"],
    queryFn: () => apiRequest<{ items: LegalDocument[] }>("public/legal-documents"),
    staleTime: 60_000,
    retry: false,
  });
  return <>
    <button className="legal-document-link" type="button" onClick={() => dialog.current?.showModal()}>{label}</button>
    <dialog className="legal-document-dialog" ref={dialog} aria-labelledby={titleId}>
      <header><h2 id={titleId}>{label}</h2><Button variant="ghost" onClick={() => dialog.current?.close()} aria-label="Закрыть документ">Закрыть</Button></header>
      <div className="legal-document-body">
        <p className="form-message is-warning">Проекты для тестирования. Утверждённые юридические тексты ещё не опубликованы. Не используйте стенд для реальных сделок до их согласования.</p>
        {documents.isPending ? <p role="status">Загружаем документы…</p> : null}
        {documents.error ? <div role="alert"><p>Не удалось загрузить документы.</p><Button onClick={() => void documents.refetch()}>Повторить</Button></div> : null}
        {documents.data?.items.filter(item => !type || item.type === type).map(item => <article key={item.type}>
          <h3>{item.title}</h3><small>Проект · версия {item.version}</small>
          {item.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </article>)}
      </div>
    </dialog>
  </>;
}
