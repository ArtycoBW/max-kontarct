"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type LegalDocument = { type: string; title: string; version: string; status: "DRAFT"; paragraphs: string[] };

export function LegalDocuments({ type, label = "Документы и согласия", describedBy }: { type?: string; label?: string; describedBy?: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(type ?? "PERSONAL_DATA");
  const documents = useQuery({
    queryKey: ["legal-documents"],
    queryFn: () => apiRequest<{ items: LegalDocument[] }>("public/legal-documents"),
    staleTime: 60_000,
    retry: false,
  });
  return <Modal open={open} onClose={() => setOpen(false)} title={type ? "Документ" : "Документы и согласия"}
      trigger={<Button variant="outline" className="legal-document-link" aria-describedby={describedBy} type="button" onClick={() => setOpen(true)}>{label}<ArrowUpRight size={16} aria-hidden="true" /></Button>}
      footer={<Button className="full-width" type="button" onClick={() => setOpen(false)}>Понятно</Button>}>
      <div className="legal-document-body">
        {!type && documents.data ? <div className="legal-document-picker"><span>Выберите документ</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger aria-label="Выберите документ"><SelectValue /></SelectTrigger>
            <SelectContent className="legal-document-options" collisionPadding={16}>
              {documents.data.items.map(item => <SelectItem key={item.type} value={item.type}>{item.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div> : null}
        {documents.isPending ? <p role="status">Загружаем документы…</p> : null}
        {documents.error ? <div role="alert"><p>Не удалось загрузить документы.</p><Button onClick={() => void documents.refetch()}>Повторить</Button></div> : null}
        {documents.data?.items.filter(item => item.type === (type ?? selected)).map(item => <article key={item.type}>
          <h3>{item.title}</h3>
          {item.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </article>)}
      </div>
    </Modal>;
}
