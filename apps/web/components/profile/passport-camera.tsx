"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { cameraCrop } from "@/lib/ocr/image-quality";
import type { Quad } from "@/lib/ocr/perspective";
import type { PassportPage } from "@/lib/ocr/passport-parser";

export function PassportCamera({ page, onCapture, onCancel }: { page: PassportPage; onCapture: (file: File, corners?: Quad) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState("");
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
  const crop = () => {
    if (!video.current || !frame.current || !video.current.videoWidth) return null;
    const view = video.current.getBoundingClientRect(), guide = frame.current.getBoundingClientRect();
    if (!view.width || !view.height) return null;
    return cameraCrop(video.current.videoWidth, video.current.videoHeight, view.width, view.height, { x: guide.x - view.x, y: guide.y - view.y, width: guide.width, height: guide.height });
  };
  useEffect(() => {
    alive.current = true;
    const element = video.current;
    let cancelled = false;
    const unavailable = () => setError("Не удалось открыть камеру. Разрешите доступ в настройках браузера / MAX или используйте камеру телефона и загрузку фото.");
    if (!navigator.mediaDevices?.getUserMedia) unavailable();
    else void navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } } }).then(async next => {
      if (cancelled) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      next.getVideoTracks().forEach(track => track.addEventListener("ended", () => { if (!cancelled) { setReady(false); setError("Камера отключилась. Закройте съёмку и попробуйте снова."); } }));
      if (video.current) {
        video.current.srcObject = next;
        try { await video.current.play(); } catch { if (!cancelled) { stop(); unavailable(); } }
      }
    }).catch(() => { if (!cancelled) unavailable(); });
    const hidden = () => { if (document.hidden) { cancelled = true; stop(); setReady(false); setError("Съёмка приостановлена. Закройте её и откройте камеру снова."); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelled = true; alive.current = false; stop(); if (element) element.srcObject = null; document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const capture = async () => {
    const guide = crop();
    if (!guide || !video.current || !ready || taking) return;
    const view = video.current.getBoundingClientRect();
    // Keep the entire visible camera image so the four-point editor can recover margins.
    const area = cameraCrop(video.current.videoWidth, video.current.videoHeight, view.width, view.height, { x: 0, y: 0, width: view.width, height: view.height });
    const left = Math.max(0, (guide.left - area.left) / area.width), top = Math.max(0, (guide.top - area.top) / area.height);
    const right = Math.min(1, left + guide.width / area.width), bottom = Math.min(1, top + guide.height / area.height);
    const corners: Quad = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    setTaking(true);
    const canvas = document.createElement("canvas");
    try {
      const scale = Math.min(1, 2200 / Math.max(area.width, area.height));
      canvas.width = Math.round(area.width * scale); canvas.height = Math.round(area.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(video.current, area.left, area.top, area.width, area.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .95));
      if (!alive.current) return;
      if (!blob) throw new Error();
      stop();
      onCapture(new File([blob], `passport-${page}.jpg`, { type: "image/jpeg" }), corners);
    } catch { if (alive.current) { setError("Не удалось сделать снимок. Попробуйте ещё раз или загрузите фото."); setTaking(false); } }
    finally { canvas.width = 0; canvas.height = 0; }
  };
  return <><div className="app-modal-body"><section className="passport-camera" aria-label="Съёмка страницы паспорта">
    <p>{page === "identity" ? "Снимите одну страницу. ФИО и обе строки с символами внизу должны целиком попасть в рамку." : page === "registration" ? "Расположите страницу с актуальным штампом регистрации внутри рамки. Не закрывайте текст пальцами." : "Расположите страницу с органом и датой выдачи внутри рамки. Не закрывайте текст пальцами."}</p>
    <div className="passport-camera-view">
      <video ref={video} autoPlay playsInline muted aria-label="Предпросмотр камеры" onLoadedData={() => { if (stream.current) setReady(true); }} />
      <div ref={frame} className={`passport-camera-guide ${page === "registration" ? "is-portrait" : "is-landscape"}`} aria-hidden="true" />
    </div>
    {!ready && !error ? <p role="status">Подключаем камеру…</p> : null}
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <p className="passport-camera-hint">После снимка можно поправить обрезку. Качество фото и результат распознавания появятся под ним. Фото не отправляются на сервер.</p>
    {error ? <label className="passport-photo-upload"><Camera size={18} /> Камера телефона
      <Input form="passport-ocr-review" type="file" capture="environment" accept="image/*" aria-label="Снять системной камерой" onChange={event => { const file = event.target.files?.[0]; if (file) { stop(); onCapture(file); } event.target.value = ""; }} />
    </label> : null}
  </section></div><DialogFooter className="app-modal-footer passport-camera-actions">
    <Button type="button" disabled={!ready || taking} onClick={() => void capture()}><Camera size={18} /> {taking ? "Сохраняем снимок в памяти…" : "Сделать снимок"}</Button>
    <Button type="button" variant="outline" onClick={onCancel}>Отменить съёмку</Button>
  </DialogFooter></>;
}
