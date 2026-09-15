"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parsePastedDetails } from "@/lib/profile/pasted-details";
import type { PassportData } from "@/lib/ocr/passport-parser";

export function PasteProfileDetails({ onApply }: { onApply: (data: Partial<PassportData>) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const parsed = parsePastedDetails(text);
  const count = Object.keys(parsed).length;
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setText(""); }}>
    <DialogTrigger asChild><Button type="button" variant="outline">Вставить данные из MAX</Button></DialogTrigger>
    <DialogContent className="app-modal"><DialogHeader className="app-modal-header"><DialogTitle>Вставка реквизитов</DialogTitle><DialogDescription>Скопируйте доступные вам данные и вставьте сюда. Вставленный текст не подтверждает личность или подлинность данных MAX.</DialogDescription></DialogHeader>
      <div className="app-modal-body"><label htmlFor="pasted-profile">Текст с подписями полей</label><Textarea id="pasted-profile" rows={8} maxLength={5000} value={text} onChange={e => setText(e.target.value)} placeholder={"Фамилия: Примеров\nИмя: Иван\nДата рождения: 12.04.1995\nАдрес регистрации: ..."} />
        <p className="field-description">Обработка выполняется на устройстве. В форму попадут только найденные поля. Проверьте их перед сохранением профиля.</p>
        <p role="status">{count ? `Найдено полей: ${count}` : text ? "Не найдены подписи полей. Используйте пример или заполните форму вручную." : "Ожидаем текст"}</p>
      </div><DialogFooter className="app-modal-footer"><Button type="button" disabled={!count} onClick={() => { onApply(parsed); setText(""); setOpen(false); }}>Перенести в форму</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
