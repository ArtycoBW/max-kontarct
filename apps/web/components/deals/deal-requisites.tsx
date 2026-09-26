"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { PasteProfileDetails } from "@/components/profile/paste-profile-details";
import { PassportScanner } from "@/components/profile/passport-scanner";
import type { PassportData } from "@/lib/ocr/passport-parser";

export function DealRequisites({ onSaved }: { onSaved: () => void }) {
  const [details, setDetails] = useState<Partial<PassportData> | null>(null);
  const [saved, setSaved] = useState(false);
  const open = (data: Partial<PassportData>) => { setDetails(data); setSaved(false); };
  return <>
    <Card className="deal-requisites">
      <h2>Мои реквизиты для договора</h2>
      <PasteProfileDetails onApply={open} />
      <PassportScanner onApply={open} />
      <Button type="button" variant="outline" className="full-width" onClick={() => open({})}>
        <PenLine size={18} /> Заполнить реквизиты вручную
      </Button>
      <p>Если профиль уже заполнен, используем сохранённые данные. Каждый участник заполняет свой профиль.</p>
      {saved ? <p className="validation-success" role="status">Реквизиты сохранены</p> : null}
    </Card>
    <Dialog open={details !== null} onOpenChange={next => { if (!next) setDetails(null); }}>
      <DialogContent className="app-modal">
        <DialogHeader className="app-modal-header is-stacked">
          <DialogTitle>Мои реквизиты для договора</DialogTitle>
          <DialogDescription>Проверьте данные. Изменения сохраняются только по кнопке в форме.</DialogDescription>
        </DialogHeader>
        <div className="app-modal-body">
          {details !== null ? <ProfileScreen embedded focusPassport={Object.keys(details).length === 0} initialDetails={details} onSaved={() => { setDetails(null); setSaved(true); onSaved(); }} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
