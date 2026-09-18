"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, ImageIcon, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchPreview, fileSizeLabel, fileTypeLabel, previewKind, type PreviewFile } from "@/lib/files/preview";
import { PdfPreview } from "./pdf-preview";

export function FilePreviewDialog({ files, index, onIndexChange, onClose, returnFocus }: {
  files: PreviewFile[]; index: number; onIndexChange: (index: number) => void; onClose: () => void; returnFocus?: () => void;
}) {
  const file = files[index];
  if (!file) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="file-preview-dialog" onCloseAutoFocus={returnFocus ? event => { event.preventDefault(); returnFocus(); } : undefined}>
      <header className="file-preview-header">
        <span className="file-type-icon" aria-hidden="true">{previewKind(file.mimeType) === "image" ? <ImageIcon size={24} /> : <FileText size={24} />}</span>
        <div><DialogTitle title={file.originalName}>{file.originalName}</DialogTitle><DialogDescription>{fileTypeLabel(file.mimeType)} · {fileSizeLabel(file.sizeBytes)}</DialogDescription></div>
      </header>
      <PreviewContent key={file.id} {...file} />
      {files.length > 1 ? <footer className="file-preview-gallery">
        <Button variant="ghost" size="icon" aria-label="Предыдущий файл" disabled={index === 0} onClick={() => onIndexChange(index - 1)}><ChevronLeft size={20} /></Button>
        <span aria-live="polite">Файл {index + 1} из {files.length}</span>
        <Button variant="ghost" size="icon" aria-label="Следующий файл" disabled={index === files.length - 1} onClick={() => onIndexChange(index + 1)}><ChevronRight size={20} /></Button>
      </footer> : null}
    </DialogContent>
  </Dialog>;
}

function PreviewContent({ id, originalName, mimeType, sizeBytes, url }: PreviewFile) {
  const file = useMemo(() => ({ id, originalName, mimeType, sizeBytes, url }), [id, originalName, mimeType, sizeBytes, url]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reportError = useCallback((message: string) => setError(message), []);
  const kind = previewKind(mimeType);
  return <>
    <div className="file-preview-toolbar">
      {kind !== "unsupported" ? <div className="file-preview-tools" role="group" aria-label="Масштаб и поворот">
        <Button variant="ghost" size="icon" aria-label="Уменьшить" disabled={zoom <= 0.5 || Boolean(error)} onClick={() => setZoom(n => Math.max(0.5, n - 0.25))}><ZoomOut size={19} /></Button>
        <Button variant="ghost" className="file-preview-scale" aria-label="Сбросить масштаб" disabled={Boolean(error)} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Button>
        <Button variant="ghost" size="icon" aria-label="Увеличить" disabled={zoom >= 3 || Boolean(error)} onClick={() => setZoom(n => Math.min(3, n + 0.25))}><ZoomIn size={19} /></Button>
        <Button variant="ghost" size="icon" aria-label="Повернуть" disabled={Boolean(error)} onClick={() => setRotation(n => (n + 90) % 360)}><RotateCw size={18} /></Button>
      </div> : <span />}
      <Button asChild variant="outline" className="file-preview-download"><a href={url} download={originalName} aria-label="Скачать"><Download size={17} /><span>Скачать</span></a></Button>
    </div>
    {error ? <div className="file-preview-state" role="alert"><FileText size={36} /><strong>Не удалось открыть файл</strong><p>{error}</p><Button variant="outline" onClick={() => { setError(null); setAttempt(n => n + 1); }}>Повторить</Button></div>
      : kind === "pdf" ? <PdfPreview key={attempt} file={file} zoom={zoom} rotation={rotation} onError={reportError} />
      : kind === "image" ? <ImagePreview key={attempt} file={file} zoom={zoom} rotation={rotation} onError={reportError} />
      : <div className="file-preview-state"><FileText size={36} /><strong>Для этого формата нет предпросмотра</strong><p>Скачайте файл и откройте в подходящем приложении.</p></div>}
  </>;
}

function ImagePreview({ file, zoom, rotation, onError }: { file: PreviewFile; zoom: number; rotation: number; onError: (message: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [area, setArea] = useState({ width: 0, height: 0 });
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let disposed = false;
    let objectUrl: string | undefined;
    void fetchPreview(file, controller.signal).then(blob => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(error => {
      if (!disposed) onError(error instanceof Error && error.name === "Error" ? error.message : "Не удалось загрузить изображение. Проверьте соединение и повторите попытку.");
    }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, onError]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setArea({ width: rect.width, height: rect.height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;
  const rotatedWidth = sideways ? natural.height : natural.width;
  const rotatedHeight = sideways ? natural.width : natural.height;
  const fit = natural.width ? Math.min(Math.max(1, area.width - 32) / rotatedWidth, Math.max(1, area.height - 32) / rotatedHeight, 1) : 1;
  const scale = fit * zoom;
  return <div className="file-preview-viewport image-preview-viewport" ref={container} aria-busy={!natural.width}>
    {!natural.width ? <div className="file-preview-loading" role="status">Открываем изображение…</div> : null}
    {src ? <div className="image-preview-stage" style={{ width: rotatedWidth * scale, height: rotatedHeight * scale }}>
      {/* Authenticated in-memory blob; never an image optimisation/CDN request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={file.originalName} draggable={false} style={{ width: natural.width * scale, height: natural.height * scale, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
        onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => onError("Изображение повреждено или его не удалось прочитать. Попробуйте скачать оригинал.")} />
    </div> : null}
  </div>;
}

export function FilePreviewButton({ file, label = "Просмотреть" }: { file: PreviewFile; label?: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  return <><Button variant="outline" onClick={event => { opener.current = event.currentTarget; setOpen(true); }}>{label}</Button>
    {open ? <FilePreviewDialog files={[file]} index={0} onIndexChange={() => {}} onClose={() => setOpen(false)} returnFocus={() => opener.current?.focus()} /> : null}</>;
}
