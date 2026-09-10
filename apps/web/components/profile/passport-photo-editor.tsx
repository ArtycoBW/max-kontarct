"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Crop, RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DialogFooter } from "@/components/ui/dialog";
import { preparePhoto } from "@/lib/ocr/passport-ocr";
import type { PassportPage } from "@/lib/ocr/passport-parser";
import { fullPhoto, rectifyPhoto, validQuad, type Point, type Quad } from "@/lib/ocr/perspective";

export type PhotoEdit = { source: File; rotation: number; corners: Quad };
const cornerNames = ["Верхний левый угол", "Верхний правый угол", "Нижний правый угол", "Нижний левый угол"];

export function PassportPhotoEditor({ page, edit, onApply, onCancel }: {
  page: PassportPage; edit: PhotoEdit; onApply: (file: File, edit: PhotoEdit) => void; onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null);
  const task = useRef<AbortController | null>(null), previewUrl = useRef("");
  const [rotation, setRotation] = useState(edit.rotation), [corners, setCorners] = useState<Quad>(edit.corners);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(""), [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const drag = useRef<{ index: number; pointer: number; offset: Point } | null>(null);
  useEffect(() => {
    const controller = new AbortController(), element = canvas.current;
    void preparePhoto({ file: edit.source, rotation, page }, controller.signal).then(source => {
      try {
        if (controller.signal.aborted || !element) return;
        element.width = source.width; element.height = source.height;
        const ctx = element.getContext("2d");
        if (!ctx) throw new Error("Браузер не поддерживает редактирование фото.");
        ctx.drawImage(source, 0, 0); setSize({ width: source.width, height: source.height });
      } finally { source.width = 0; source.height = 0; }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось открыть фото."); });
    return () => { controller.abort(); if (element) { element.width = 0; element.height = 0; } };
  }, [edit.source, rotation, page]);
  useEffect(() => () => { task.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  const move = (index: number, point: Point) => {
    const clamped = { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) };
    setCorners(current => {
      const next = current.map((p, i) => i === index ? clamped : p) as Quad;
      return validQuad(next) ? next : current;
    });
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    move(drag.current.index, { x: (event.clientX - bounds.left - drag.current.offset.x) / bounds.width, y: (event.clientY - bounds.top - drag.current.offset.y) / bounds.height });
  };
  const clearPreview = () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ""; setPreview(null); };
  const process = async () => {
    if (!canvas.current || busy || !size.width) return;
    const controller = new AbortController(); task.current = controller; setBusy(true); setError("");
    try {
      const blob = await rectifyPhoto(canvas.current, corners, controller.signal);
      if (controller.signal.aborted) return;
      const file = new File([blob], `passport-${page}-edited.jpg`, { type: "image/jpeg" });
      previewUrl.current = URL.createObjectURL(file); setPreview({ file, url: previewUrl.current });
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось обрезать фото."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <><div className="app-modal-body passport-editor">
    <p id="crop-instructions">{preview ? "Проверьте результат: все нужные строки должны остаться на снимке, без обрезанных букв." : "Перетащите четыре точки на углы страницы. Расположите их по контуру — наклонённые края выровняются."}</p>
    <div className="passport-crop-workspace" hidden={Boolean(preview)}>
      <div ref={stage} className="passport-crop-stage" style={{ aspectRatio: size.width ? `${size.width} / ${size.height}` : "1", maxWidth: size.width ? `min(100%, ${42 * size.width / size.height}dvh)` : "100%" }}>
        <canvas ref={canvas} aria-label="Фотография для обрезки" />
        {size.width ? <><svg className="passport-crop-outline" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <path d={`M0 0H1V1H0Z M${corners.map(p => `${p.x} ${p.y}`).join(" L")}Z`} fillRule="evenodd" fill="#0009" />
          <polygon points={corners.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>{corners.map((p, index) => <Button key={index} type="button" variant="unstyled" className="passport-crop-handle" aria-label={cornerNames[index]} aria-describedby="crop-instructions" disabled={busy}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={event => {
            if (!event.isPrimary || !stage.current) return;
            const bounds = stage.current.getBoundingClientRect();
            drag.current = { index, pointer: event.pointerId, offset: { x: event.clientX - bounds.left - p.x * bounds.width, y: event.clientY - bounds.top - p.y * bounds.height } };
            event.currentTarget.setPointerCapture(event.pointerId); setHint("Углы не пересекаются. Для точной настройки также можно использовать стрелки клавиатуры.");
          }}
          onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={event => {
            const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
            const direction = directions[event.key]; if (!direction) return; event.preventDefault();
            const step = event.shiftKey ? .025 : .005; move(index, { x: p.x + direction.x * step, y: p.y + direction.y * step });
          }}><span aria-hidden="true" /></Button>)}</> : <span className="passport-crop-loading">{error ? "Фото недоступно" : "Открываем фото…"}</span>}
      </div>
    </div>
    {preview ? <div className="passport-crop-preview">{/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.url} alt="Результат обрезки" /></div> : null}
    {!preview ? <div className="passport-editor-tools"><Button type="button" variant="outline" disabled={busy || !size.width} onClick={() => { setSize({ width: 0, height: 0 }); setCorners(fullPhoto()); setRotation((rotation + 90) % 360); setError(""); }}><RotateCw size={16} /> Повернуть</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setCorners(fullPhoto()); setHint(""); }}><Undo2 size={16} /> Сбросить углы</Button></div> : null}
    {hint && !preview ? <p className="passport-camera-hint">{hint}</p> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <p className="passport-camera-hint">Оригинал доступен до закрытия сканирования. Фото и обработанный результат остаются на устройстве.</p>
  </div><DialogFooter className="app-modal-footer passport-camera-actions">
    {preview ? <><Button type="button" onClick={() => onApply(preview.file, { source: edit.source, rotation, corners })}><Check size={18} /> Использовать фото</Button><Button type="button" variant="outline" onClick={clearPreview}>Поправить углы</Button></>
      : <Button type="button" disabled={busy || !size.width} onClick={() => void process()}><Crop size={18} /> {busy ? "Выравниваем фото…" : "Посмотреть результат"}</Button>}
    <Button type="button" variant="ghost" onClick={onCancel}>Отменить редактирование</Button>
  </DialogFooter></>;
}
