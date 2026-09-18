"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchPreview, type PreviewFile } from "@/lib/files/preview";

export function PdfPreview({ file, zoom, rotation, onError }: {
  file: PreviewFile; zoom: number; rotation: number; onError: (message: string) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [rendered, setRendered] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderKey = `${pageNumber}:${width}:${zoom}:${rotation}`;
  const busy = !document || rendered !== renderKey;
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void (async () => {
      try {
        const [pdfjs, blob] = await Promise.all([import("pdfjs-dist"), fetchPreview(file, controller.signal)]);
        if (disposed) return;
        const base = `/pdfjs/${pdfjs.version}/`;
        pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
        const data = new Uint8Array(await blob.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({ data, cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` });
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch (error) {
        if (!disposed) onError(error instanceof Error && error.name === "PasswordException"
          ? "PDF защищён паролем. Скачайте его и откройте в приложении для документов."
          : error instanceof Error && error.name === "Error" ? error.message
          : "Не удалось открыть PDF. Файл повреждён, загрузка прервалась или формат не поддерживается.");
      } finally { clearTimeout(timeout); }
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); void task?.destroy(); };
  }, [file, onError]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !width) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled || !canvas.current) return;
        const angle = (page.rotate + rotation) % 360;
        const natural = page.getViewport({ scale: 1, rotation: angle });
        const scale = Math.max(1, width - 32) / natural.width * zoom;
        const viewport = page.getViewport({ scale, rotation: angle });
        // Bound canvas memory on mobile while retaining a scrollable zoomed page.
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
        const target = canvas.current;
        target.width = Math.ceil(viewport.width * pixelRatio);
        target.height = Math.ceil(viewport.height * pixelRatio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        render = page.render({ canvas: target, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await render.promise;
        if (!cancelled) setRendered(renderKey);
      } catch { if (!cancelled) onError("Не удалось отобразить страницу PDF. Повторите попытку или скачайте файл."); }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [document, pageNumber, width, zoom, rotation, onError, renderKey]);

  return <div className="pdf-preview">
    <div className="file-preview-viewport" ref={container} aria-busy={busy}>
      {busy ? <div className="file-preview-loading" role="status">Открываем PDF…</div> : null}
      <canvas ref={canvas} role="img" aria-label={`Страница ${pageNumber}`} style={{ visibility: busy ? "hidden" : "visible" }} />
    </div>
    <nav className="pdf-preview-pages" aria-label="Страницы PDF">
      <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={!document || pageNumber === 1} onClick={() => setPageNumber(n => n - 1)}><ChevronLeft size={18} /></Button>
      <span aria-live="polite">{document ? `${pageNumber} из ${document.numPages}` : "Загрузка страниц…"}</span>
      <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={!document || pageNumber === document.numPages} onClick={() => setPageNumber(n => n + 1)}><ChevronRight size={18} /></Button>
    </nav>
  </div>;
}
