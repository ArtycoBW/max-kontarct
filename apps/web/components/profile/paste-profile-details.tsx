"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inspectPastedDetails } from "@/lib/profile/pasted-details";
import { passportFieldLabels, type PassportData, type PassportField } from "@/lib/ocr/passport-parser";

export function PasteProfileDetails({ onApply }: { onApply: (data: Partial<PassportData>) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { data: parsed, reviewFields } = inspectPastedDetails(text);
  const count = Object.keys(parsed).length;
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setText(""); }}>
    <DialogTrigger asChild><Button type="button" className="profile-paste-trigger" variant="outline">Вставить из Цифрового ID / Госуслуг</Button></DialogTrigger>
    <DialogContent className="app-modal"><DialogHeader className="app-modal-header is-stacked"><DialogTitle>Вставить данные документа</DialogTitle><DialogDescription>В MAX откройте «Цифровой ID» → «Паспорт» → «Скопировать данные». Вернитесь сюда и вставьте текст. Можно также вставить данные паспорта, скопированные с Госуслуг.</DialogDescription></DialogHeader>
      <div className="app-modal-body"><label htmlFor="pasted-profile">Скопированный текст</label><Textarea id="pasted-profile" rows={8} maxLength={5000} autoComplete="off" spellCheck={false} value={text} onChange={e => setText(e.target.value)} placeholder="Вставьте скопированные данные целиком. Переписывать их по шаблону не нужно." />
        <p className="field-description">Обработка выполняется на устройстве. В форму попадут только найденные поля. Проверьте их перед сохранением профиля.</p>
        <p className="field-description">Это перенос реквизитов, а не проверка личности через Цифровой ID.</p>
        <p role="status">{count ? `Готово к переносу полей: ${count}` : text ? "Не удалось определить поля. Скопируйте данные документа целиком, с подписями, или заполните реквизиты вручную." : "Ожидаем текст"}</p>
        {count > 0 ? <dl className="pasted-details-preview">{Object.entries(parsed).map(([key, value]) => <div key={key}><dt>{passportFieldLabels[key as PassportField]}</dt><dd>{value}</dd></div>)}</dl> : null}
        {reviewFields.length > 0 ? <p className="field-description">Не перенесём поля с неверным форматом или разными значениями: {reviewFields.map(key => passportFieldLabels[key]).join(", ")}. Их можно заполнить в форме вручную.</p> : null}
      </div><DialogFooter className="app-modal-footer"><Button type="button" disabled={!count} onClick={() => { onApply(parsed); setText(""); setOpen(false); }}>Перенести в форму</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
