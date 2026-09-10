"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, CircleAlert, Camera, RotateCw, ScanLine, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { passportFieldLabels, type PassportData, type PassportField, type PassportPage } from "@/lib/ocr/passport-parser";
import { recognizePassport, validatePassportPhoto } from "@/lib/ocr/passport-ocr";
import { PassportCamera } from "./passport-camera";
import { activeReviewIssues, issueDescription, reviewGroups, type PassportReview } from "@/lib/ocr/passport-review";

const pages: { key: PassportPage; title: string; hint: string }[] = [
  { key: "issuance", title: "Кем выдан паспорт", hint: "Страница с органом выдачи, датой и кодом подразделения" },
  { key: "identity", title: "Фото и личные данные", hint: "Страница с ФИО, датой и местом рождения" },
  { key: "registration", title: "Регистрация", hint: "Страница с актуальной отметкой о месте жительства" },
];
type Photo = { file: File; url: string; rotation: number };
const dateFields = new Set(["birthDate", "issuedAt"]);

export function PassportScanner({ onApply }: { onApply: (data: PassportData) => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" className="full-width"><ScanLine size={18} /> Считать данные паспорта</Button></DialogTrigger>
    {open ? <PassportScanDialog onApply={data => { onApply(data); setOpen(false); }} /> : null}
  </Dialog>;
}

function PassportScanDialog({ onApply }: { onApply: (data: PassportData) => void }) {
  const [photos, setPhotos] = useState<Partial<Record<PassportPage, Photo>>>({});
  const resources = useRef(new Set<string>());
  const task = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [data, setData] = useState<PassportData | null>(null);
  const [review, setReview] = useState<Pick<PassportReview, "issues" | "expected">>({ issues: [], expected: [] });
  const [edited, setEdited] = useState<PassportField[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [cameraPage, setCameraPage] = useState<PassportPage | null>(null);
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
      setError(""); setData(null); setConfirmed(false); setEdited([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть фотографию."); }
  };
  const scan = async () => {
    const controller = new AbortController();
    task.current = controller;
    setBusy(true); setError(""); setProgress(0); setConfirmed(false); setData(null);
    try {
      const result = await recognizePassport(pages.flatMap(({ key }) => photos[key] ? [{ ...photos[key]!, page: key }] : []), controller.signal, setProgress);
      if (controller.signal.aborted) return;
      setData(result.data); setReview({ issues: result.issues, expected: result.expected }); setEdited([]);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось распознать страницы.");
    } finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  };
  const issues = data ? activeReviewIssues(data, review, edited) : [];
  const filledCount = data ? review.expected.filter(key => data[key].trim()).length : 0;
  const changeField = (key: PassportField, value: string) => {
    setConfirmed(false); setData(current => current ? { ...current, [key]: value } : current);
    setEdited(current => current.includes(key) ? current : [...current, key]);
  };
  const focusIssue = () => {
    const field = issues[0]?.field;
    if (!field) return;
    const input = document.getElementById(`ocr-${field}`);
    input?.scrollIntoView({ block: "center", behavior: "auto" }); input?.focus({ preventScroll: true });
  };
  return <DialogContent className="app-modal" showCloseButton={false} aria-describedby={undefined}>
    <DialogHeader className="app-modal-header"><DialogTitle>{cameraPage ? `Съёмка: ${pages.find(page => page.key === cameraPage)?.title}` : data ? "Проверьте данные" : "Сканирование паспорта"}</DialogTitle>
      <DialogClose asChild><Button variant="unstyled" className="app-modal-close" type="button" aria-label="Закрыть окно"><X size={20} /></Button></DialogClose>
    </DialogHeader>
    {cameraPage ? <PassportCamera key={cameraPage} page={cameraPage} onCancel={() => setCameraPage(null)} onCapture={file => { replace(cameraPage, file); setCameraPage(null); }} /> : <div className="app-modal-body">
    <p className="ocr-privacy"><ShieldCheck size={16} aria-hidden="true" /> Фото обрабатываются только на вашем устройстве. Данные сохранятся после отдельного нажатия «Сохранить профиль».</p>
    {!data ? <>
      <p>Лучше снять каждую страницу отдельно, ровно и без бликов. Разворот с выдачей и личными данными можно загрузить в «Фото и личные данные». До трёх фотографий; регистрация может находиться дальше в паспорте.</p>
      <div className="passport-photo-list">{pages.map(({ key, title, hint }) => <section className="passport-photo" key={key}>
        <div><strong>{title}</strong><small>{hint}</small></div>
        {photos[key] ? <>
          <div className="passport-photo-preview">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[key]!.url} alt={title} style={{ transform: `rotate(${photos[key]!.rotation}deg)` }} />
          </div>
          <div className="passport-photo-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setPhotos(current => ({ ...current, [key]: { ...current[key]!, rotation: (current[key]!.rotation + 90) % 360 } }))}><RotateCw size={16} /> Повернуть</Button>
            <Button type="button" variant="ghost" disabled={busy} aria-label={`Удалить: ${title}`} onClick={() => replace(key)}><Trash2 size={16} /></Button></div>
        </> : null}
        <div className="passport-photo-source-actions"><label className="passport-photo-upload"><Upload size={18} /> {photos[key] ? "Заменить фото" : "Загрузить фото"}
          <Input form="passport-ocr-review" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Фото: ${title}`} disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; if (file) replace(key, file); event.target.value = ""; }} />
        </label><Button type="button" variant="outline" disabled={busy} onClick={() => { setError(""); setCameraPage(key); }} aria-label={`Снять: ${title}`}><Camera size={18} /> Снять</Button></div>
      </section>)}</div>
    </> : <>
      <Alert role="status" className={`ocr-review-summary ${issues.length ? "has-issues" : ""}`}>
        <ScanLine size={20} aria-hidden="true" />
        <div><AlertTitle>Заполнено {filledCount} из {review.expected.length} полей</AlertTitle>
          <AlertDescription>{issues.length ? `Требуют внимания: ${issues.length}. Подсказки находятся рядом с полями.` : "Сверьте данные с оригиналом перед переносом в профиль."}</AlertDescription>
          {issues.length ? <Button type="button" variant="ghost" className="ocr-summary-action" onClick={focusIssue}>К первому полю <ArrowDown size={14} /></Button> : null}
        </div>
      </Alert>
      <div className="passport-review-groups">{reviewGroups.map(group => <fieldset className="passport-review-group" key={group.title}>
        <legend>{group.title}<span>{group.fields.filter(key => data[key].trim()).length} / {group.fields.length}</span></legend>
        <div className="passport-review-fields">{group.fields.map(key => {
          const issue = issues.find(issue => issue.field === key);
          return <div className={`form-field ocr-review-field ${issue ? "needs-attention" : ""}`} key={key}><label htmlFor={`ocr-${key}`}>{passportFieldLabels[key]}{key === "middleName" ? <small>если есть</small> : null}</label>
        {/* No ancestor form owner: Enter must never submit the profile behind this dialog. */}
        {dateFields.has(key) ? <DatePicker id={`ocr-${key}`} value={data[key]} aria-describedby={issue ? `ocr-hint-${key}` : undefined} aria-invalid={Boolean(issue)} onChange={value => changeField(key, value)} />
          : <Input id={`ocr-${key}`} form="passport-ocr-review" maxLength={key === "address" || key === "issuer" ? 500 : 250} value={data[key]} aria-describedby={issue ? `ocr-hint-${key}` : undefined} aria-invalid={Boolean(issue)}
            onChange={event => changeField(key, event.target.value)} />}
        {issue ? <p id={`ocr-hint-${key}`} className="ocr-field-hint"><CircleAlert size={14} aria-hidden="true" />{issueDescription(issue)}</p> : null}
      </div>; })}</div>
      </fieldset>)}</div>
      <label className="ocr-confirm"><Checkbox form="passport-ocr-review" checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /> Я проверил данные по паспорту</label>
      <Button type="button" variant="ghost" onClick={() => { setData(null); setConfirmed(false); }}>Выбрать другие фотографии</Button>
    </>}
    {busy ? <div className="ocr-progress" role="status"><Progress value={progress} aria-label="Распознавание паспорта" /><span>{progress < 15 ? "Загружаем локальный модуль распознавания…" : `Распознаём страницы: ${progress}%`}</span></div> : null}
    {error ? <Alert variant="destructive" className="ocr-failure"><CircleAlert size={20} aria-hidden="true" /><div><AlertTitle>Не получилось прочитать фото</AlertTitle><AlertDescription>{error}</AlertDescription></div></Alert> : null}
    </div>}
    {!cameraPage ? <DialogFooter className="app-modal-footer">{data ? <Button type="button" className="full-width" disabled={!confirmed || !Object.values(data).some(Boolean)} onClick={() => onApply(data)}>Перенести в профиль</Button>
      : busy ? <Button type="button" variant="outline" className="full-width" onClick={() => { task.current?.abort(); setBusy(false); }}>Отменить распознавание</Button>
        : <Button type="button" className="full-width" disabled={!Object.values(photos).some(Boolean)} onClick={() => void scan()}>Распознать данные</Button>}</DialogFooter> : null}
  </DialogContent>;
}
