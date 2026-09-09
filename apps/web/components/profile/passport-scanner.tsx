"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCw, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { passportFieldLabels, type PassportData, type PassportField, type PassportPage } from "@/lib/ocr/passport-parser";
import { recognizePassport, validatePassportPhoto } from "@/lib/ocr/passport-ocr";

const pages: { key: PassportPage; title: string; hint: string }[] = [
  { key: "issuance", title: "Кем выдан паспорт", hint: "Страница с органом выдачи, датой и кодом подразделения" },
  { key: "identity", title: "Фото и личные данные", hint: "Страница с ФИО, датой и местом рождения" },
  { key: "registration", title: "Регистрация", hint: "Страница с актуальной отметкой о месте жительства" },
];
type Photo = { file: File; url: string; rotation: number };
const dateFields = new Set(["birthDate", "issuedAt"]);

export function PassportScanner({ onApply }: { onApply: (data: PassportData) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" className="full-width" onClick={() => setOpen(true)}><ScanLine size={18} /> Считать данные паспорта</Button>
    {open ? <PassportScanDialog onClose={() => setOpen(false)} onApply={data => { onApply(data); setOpen(false); }} /> : null}
  </>;
}

function PassportScanDialog({ onClose, onApply }: { onClose: () => void; onApply: (data: PassportData) => void }) {
  const [photos, setPhotos] = useState<Partial<Record<PassportPage, Photo>>>({});
  const resources = useRef(new Set<string>());
  const task = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [data, setData] = useState<PassportData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const urls = resources.current;
    return () => { task.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  const replace = (key: PassportPage, file?: File) => {
    try {
      if (file) validatePassportPhoto(file);
      const previous = photos[key];
      if (previous) { URL.revokeObjectURL(previous.url); resources.current.delete(previous.url); }
      const url = file ? URL.createObjectURL(file) : "";
      if (url) resources.current.add(url);
      setPhotos(current => ({ ...current, [key]: file ? { file, url, rotation: 0 } : undefined }));
      setError(""); setData(null); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть фотографию."); }
  };
  const scan = async () => {
    const controller = new AbortController();
    task.current = controller;
    setBusy(true); setError(""); setProgress(0); setConfirmed(false); setData(null);
    try {
      const result = await recognizePassport(pages.flatMap(({ key }) => photos[key] ? [{ ...photos[key]!, page: key }] : []), controller.signal, setProgress);
      if (controller.signal.aborted) return;
      setData(result.data); setWarnings(result.warnings);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось распознать страницы.");
    } finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  };
  const entries = Object.entries(passportFieldLabels) as [PassportField, string][];
  return <Modal open onClose={onClose} title={data ? "Проверьте данные" : "Сканирование паспорта"}
    footer={data ? <Button type="button" className="full-width" disabled={!confirmed || !Object.values(data).some(Boolean)} onClick={() => onApply(data)}>Перенести в профиль</Button>
      : busy ? <Button type="button" variant="outline" className="full-width" onClick={() => { task.current?.abort(); setBusy(false); }}>Отменить распознавание</Button>
        : <Button type="button" className="full-width" disabled={!Object.values(photos).some(Boolean)} onClick={() => void scan()}>Распознать данные</Button>}>
    <p>Фотографии обрабатываются на вашем устройстве и не отправляются на сервер. Сохранение данных в профиле — отдельным действием.</p>
    {!data ? <>
      <p>Снимайте страницу целиком, ровно и без бликов. Можно добавить до трёх фотографий; страница регистрации может находиться дальше в паспорте.</p>
      <div className="passport-photo-list">{pages.map(({ key, title, hint }) => <section className="passport-photo" key={key}>
        <div><strong>{title}</strong><small>{hint}</small></div>
        {photos[key] ? <>
          <div className="passport-photo-preview">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[key]!.url} alt={title} style={{ transform: `rotate(${photos[key]!.rotation}deg)` }} />
          </div>
          <div className="passport-photo-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setPhotos(current => ({ ...current, [key]: { ...current[key]!, rotation: (current[key]!.rotation + 90) % 360 } }))}><RotateCw size={16} /> Повернуть</Button>
            <Button type="button" variant="ghost" disabled={busy} aria-label={`Удалить: ${title}`} onClick={() => replace(key)}><Trash2 size={16} /></Button></div>
        </> : <label className="passport-photo-upload"><Camera size={18} /> Добавить фото
          <input form="passport-ocr-review" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Фото: ${title}`} disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; if (file) replace(key, file); event.target.value = ""; }} />
        </label>}
      </section>)}</div>
    </> : <>
      <p>Сверьте каждое поле с паспортом. Исправьте ошибки и оставьте пустыми поля, которые не удалось прочитать. Заполненные поля заменят соответствующие значения в форме профиля.</p>
      {warnings.map(warning => <p className="ocr-warning" key={warning}>{warning}</p>)}
      <div className="passport-review-fields">{entries.map(([key, label]) => <label className="form-field" key={key}><span>{label}</span>
        {/* No ancestor form owner: Enter must never submit the profile behind this dialog. */}
        <Input form="passport-ocr-review" type={dateFields.has(key) ? "date" : "text"} maxLength={key === "address" || key === "issuer" ? 500 : 250} value={data[key]}
          onChange={event => { setConfirmed(false); setData({ ...data, [key]: event.target.value }); }} />
      </label>)}</div>
      <label className="ocr-confirm"><input form="passport-ocr-review" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Я проверил данные по паспорту</label>
      <Button type="button" variant="ghost" onClick={() => { setData(null); setConfirmed(false); setWarnings([]); }}>Выбрать другие фотографии</Button>
    </>}
    {busy ? <div className="ocr-progress" role="status"><progress max={100} value={progress} /><span>{progress < 15 ? "Загружаем локальный модуль распознавания…" : `Распознаём страницы: ${progress}%`}</span></div> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </Modal>;
}
