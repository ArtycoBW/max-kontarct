"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchPreview, type PreviewFile } from "@/lib/files/preview";

export function PdfPreview({ file, zoom, rotation, fitPage = false, onError }: {
  file: PreviewFile; zoom: number; rotation: number; fitPage?: boolean; onError: (message: string) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [rendered, setRendered] = useState<{ key: string; pageNumber: number } | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const { width, height } = area;
  const container = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const displayedPage = useRef<number | null>(null);
  const renderKey = `${pageNumber}:${width}:${height}:${zoom}:${rotation}:${fitPage}`;
  const busy = !document || rendered?.key !== renderKey;
  const pageVisible = rendered?.pageNumber === pageNumber;
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
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const viewport = container.current;
      if (!viewport) return;
      const style = getComputedStyle(viewport);
      // Observe the fixed frame, not content whose scrollbars change as we render.
      // Stable gutters reserve vertical scrollbar space even before the PDF loads.
      const next = {
        width: Math.floor(viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        height: Math.floor(viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
      };
      setArea(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    });
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
        const scale = (fitPage ? Math.min(Math.max(1, width) / natural.width, Math.max(1, height) / natural.height) : Math.max(1, width) / natural.width) * zoom;
        const viewport = page.getViewport({ scale, rotation: angle });
        // Bound canvas memory on mobile while retaining a scrollable zoomed page.
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
        // Render into a private buffer: cancellation cannot clear the visible page
        // or race a new render on the same canvas during rapid zoom/rotation.
        const buffer = window.document.createElement("canvas");
        buffer.width = Math.ceil(viewport.width * pixelRatio);
        buffer.height = Math.ceil(viewport.height * pixelRatio);
        render = page.render({ canvas: buffer, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await render.promise;
        if (cancelled || !canvas.current || !container.current) return;
        const target = canvas.current;
        const scroller = container.current;
        const samePage = displayedPage.current === pageNumber;
        const previousWidth = parseFloat(target.style.width) || viewport.width;
        const previousHeight = parseFloat(target.style.height) || viewport.height;
        const centerX = (scroller.scrollLeft + scroller.clientWidth / 2 - target.offsetLeft) / previousWidth;
        const centerY = (scroller.scrollTop + scroller.clientHeight / 2 - target.offsetTop) / previousHeight;
        target.width = buffer.width;
        target.height = buffer.height;
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        target.getContext("2d")!.drawImage(buffer, 0, 0);
        buffer.width = 0;
        buffer.height = 0;
        scroller.scrollLeft = samePage ? target.offsetLeft + centerX * viewport.width - scroller.clientWidth / 2 : 0;
        scroller.scrollTop = samePage ? target.offsetTop + centerY * viewport.height - scroller.clientHeight / 2 : 0;
        displayedPage.current = pageNumber;
        setRendered({ key: renderKey, pageNumber });
      } catch { if (!cancelled) onError("Не удалось отобразить страницу PDF. Повторите попытку или скачайте файл."); }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [document, pageNumber, width, height, zoom, rotation, fitPage, onError, renderKey]);

  return <div className="pdf-preview">
    <div className="pdf-preview-surface" ref={surface}>
    <div className="file-preview-viewport" ref={container} aria-busy={busy}>
      {!pageVisible ? <div className="file-preview-loading" role="status">Открываем PDF…</div> : null}
      <canvas ref={canvas} role="img" aria-label={`Страница ${pageNumber}`} style={{ visibility: pageVisible ? "visible" : "hidden" }} />
    </div>
    </div>
    {document && document.numPages > 1 ? <nav className="pdf-preview-pages" aria-label="Страницы PDF">
      <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={!document || pageNumber === 1} onClick={() => setPageNumber(n => n - 1)}><ChevronLeft size={18} /></Button>
      {document ? <Select value={String(pageNumber)} onValueChange={value => setPageNumber(Number(value))}>
        <SelectTrigger aria-label="Перейти к странице" className="pdf-page-picker"><SelectValue /></SelectTrigger>
        <SelectContent>{Array.from({ length: document.numPages }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1} из {document.numPages}</SelectItem>)}</SelectContent>
      </Select> : <span>Загрузка страниц…</span>}
      <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={!document || pageNumber === document.numPages} onClick={() => setPageNumber(n => n + 1)}><ChevronRight size={18} /></Button>
    </nav> : null}
  </div>;
}
