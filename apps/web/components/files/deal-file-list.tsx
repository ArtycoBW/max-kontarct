"use client";

import type { DealFileResponse } from "@max-contract/contracts";
import { useRef, useState } from "react";
import { Download, Eye, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDealFileDownloadUrl } from "@/lib/api/files";
import { fileSizeLabel, fileTypeLabel, previewKind } from "@/lib/files/preview";
import { FilePreviewDialog } from "./file-preview";

export function DealFileList({ dealId, files, showReview = false }: { dealId: string; files: DealFileResponse[]; showReview?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const index = files.findIndex(file => file.id === selected);
  if (!files.length) return null;
  return <>
    <ul className="deal-file-list" aria-label="Файлы">
      {files.map(file => <li className="deal-file-row" key={file.id}>
        <Button variant="unstyled" className="deal-file-open" aria-label={`Просмотреть ${file.originalName}`} onClick={event => { opener.current = event.currentTarget; setSelected(file.id); }}>
          <span className={`file-type-icon ${previewKind(file.mimeType) === "image" ? "is-image" : ""}`} aria-hidden="true">{previewKind(file.mimeType) === "image" ? <ImageIcon size={24} /> : <FileText size={24} />}</span>
          <span className="deal-file-info"><strong>{file.originalName}</strong><small>{fileTypeLabel(file.mimeType)} · {fileSizeLabel(file.sizeBytes)}</small><span className="deal-file-preview-label"><Eye size={13} /> Просмотреть</span></span>
        </Button>
        <Button asChild size="icon" variant="ghost"><a href={getDealFileDownloadUrl(dealId, file.id)} download={file.originalName} aria-label={`Скачать ${file.originalName}`}><Download size={18} /></a></Button>
        {showReview ? <div className="deal-file-review"><span>{file.owner.isCurrentUser ? "Ваш файл" : file.owner.displayName} · {{ ACCEPTED: "Принят", PENDING: "На проверке", REJECTED: "Нужно исправить" }[file.reviewStatus]}</span>{file.reviewComment ? <p>{file.reviewComment}</p> : null}</div> : null}
      </li>)}
    </ul>
    {index >= 0 ? <FilePreviewDialog files={files.map(file => ({ ...file, url: getDealFileDownloadUrl(dealId, file.id) }))} index={index} onIndexChange={next => setSelected(files[next]!.id)} onClose={() => setSelected(null)} returnFocus={() => opener.current?.focus()} /> : null}
  </>;
}
