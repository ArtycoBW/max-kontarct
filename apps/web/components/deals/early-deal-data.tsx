"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { DocumentsScreen } from "@/components/files/documents-screen";

export function EarlyDealData({ dealId, beforeOpen, onProfileSaved, roleChosen }: { dealId: string; beforeOpen: () => Promise<void>; onProfileSaved: () => void; roleChosen: boolean }) {
  const [section, setSection] = useState<"profile" | "materials" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const open = async (next: "profile" | "materials") => {
    setPending(true); setError("");
    try { await beforeOpen(); setSection(next); } catch { setError("Не удалось сохранить текущий шаг. Повторите попытку."); }
    finally { setPending(false); }
  };
  return <>
    <Card className="early-deal-data"><h2>Данные и материалы</h2><p>Свои реквизиты можно заполнить вручную, вставить из скопированного текста или распознать по фото. Фото предмета сделки добавляются отдельно и видны второй стороне.</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void open("profile")}>Мои реквизиты</Button>
      <Button type="button" variant="outline" disabled={pending || !roleChosen} onClick={() => void open("materials")}>Фото и материалы предмета</Button>
      {!roleChosen ? <p>Для материалов сначала выберите свою роль в сделке.</p> : null}
      {error ? <p role="alert" className="field-error">{error}</p> : null}
    </Card>
    <Dialog open={section !== null} onOpenChange={next => { if (!next) setSection(null); }}><DialogContent className="app-modal">
      <DialogHeader className="app-modal-header"><DialogTitle>{section === "profile" ? "Мои реквизиты для договора" : "Фото и материалы предмета"}</DialogTitle><DialogDescription>{section === "profile" ? "Это ваши данные профиля. Изменения сохраняются только по кнопке в форме." : "Не добавляйте сюда паспорт и другие личные документы."}</DialogDescription></DialogHeader>
      <div className="app-modal-body">
        {section === "profile" ? <ProfileScreen embedded onSaved={() => { setSection(null); onProfileSaved(); }} /> : section === "materials" ? <DocumentsScreen materialsOnly dealId={dealId} onBack={() => setSection(null)} onSelectDeal={() => undefined} /> : null}
      </div>
    </DialogContent></Dialog>
  </>;
}
