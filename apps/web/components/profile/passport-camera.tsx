"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { cameraCrop, inspectCapture, type CaptureQuality } from "@/lib/ocr/image-quality";
import type { PassportPage } from "@/lib/ocr/passport-parser";

export function PassportCamera({ page, onCapture, onCancel }: { page: PassportPage; onCapture: (file: File) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
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
  useEffect(() => {
    if (!ready) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let previous: Uint8Array | undefined;
    const timer = setInterval(() => {
      const area = crop();
      if (!ctx || !area || !video.current || video.current.readyState < 2) return;
      canvas.width = 240; canvas.height = Math.round(240 * area.height / area.width);
      ctx.drawImage(video.current, area.left, area.top, area.width, area.height, 0, 0, canvas.width, canvas.height);
      const result = inspectCapture(ctx.getImageData(0, 0, canvas.width, canvas.height), previous);
      previous = result.gray; setQuality(result.quality);
    }, 500);
    return () => { clearInterval(timer); previous = undefined; canvas.width = 0; canvas.height = 0; };
  }, [ready]);
  const capture = async () => {
    const area = crop();
    if (!area || !video.current || !ready || taking) return;
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
      onCapture(new File([blob], `passport-${page}.jpg`, { type: "image/jpeg" }));
    } catch { if (alive.current) { setError("Не удалось сделать снимок. Попробуйте ещё раз или загрузите фото."); setTaking(false); } }
    finally { canvas.width = 0; canvas.height = 0; }
  };
  const messages = quality ? [
    quality.dark ? "Темно: добавьте свет или подойдите к окну." : "",
    quality.glare ? "Возможен блик: измените угол камеры или освещения." : "",
    quality.moving ? "Камера движется: задержите её неподвижно." : "",
    quality.soft && !quality.dark && !quality.moving ? "Мало чётких деталей: наведите фокус на текст и проверьте расстояние." : "",
  ].filter(Boolean) : [];
  return <><div className="app-modal-body"><section className="passport-camera" aria-label="Съёмка страницы паспорта">
    <p>{page === "identity" ? "Снимите одну страницу. ФИО и обе строки с символами внизу должны целиком попасть в рамку." : page === "registration" ? "Расположите страницу с актуальным штампом регистрации внутри рамки. Не закрывайте текст пальцами." : "Расположите страницу с органом и датой выдачи внутри рамки. Не закрывайте текст пальцами."}</p>
    <div className="passport-camera-view">
      <video ref={video} autoPlay playsInline muted aria-label="Предпросмотр камеры" onLoadedData={() => { if (stream.current) setReady(true); }} />
      <div ref={frame} className={`passport-camera-guide ${page === "registration" ? "is-portrait" : "is-landscape"}`} aria-hidden="true" />
    </div>
    <div role="status" className="passport-camera-quality">
      {!ready && !error ? <p>Подключаем камеру…</p> : null}
      {ready && !quality ? <p>Проверяем освещение и чёткость…</p> : null}
      {ready && quality && !messages.length ? <p>Света достаточно. Проверьте, что текст читается и вся страница попала в рамку.</p> : null}
      {ready ? messages.map(message => <p className="ocr-warning" key={message}><CircleAlert size={16} aria-hidden="true" /> {message}</p>) : null}
    </div>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <p className="passport-camera-hint">Подсказки приблизительные и не гарантируют качество. Перед распознаванием проверьте снимок. Кадры не отправляются на сервер.</p>
    {error ? <label className="passport-photo-upload"><Camera size={18} /> Камера телефона
      <Input form="passport-ocr-review" type="file" capture="environment" accept="image/*" aria-label="Снять системной камерой" onChange={event => { const file = event.target.files?.[0]; if (file) { stop(); onCapture(file); } event.target.value = ""; }} />
    </label> : null}
  </section></div><DialogFooter className="app-modal-footer passport-camera-actions">
    <Button type="button" disabled={!ready || taking} onClick={() => void capture()}><Camera size={18} /> {taking ? "Сохраняем снимок в памяти…" : "Сделать снимок"}</Button>
    <Button type="button" variant="outline" onClick={onCancel}>Отменить съёмку</Button>
  </DialogFooter></>;
}
