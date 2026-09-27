"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/lib/api/profile";
import { queryKeys } from "@/lib/api/query-keys";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { PasteProfileDetails } from "@/components/profile/paste-profile-details";
import { PassportScanner } from "@/components/profile/passport-scanner";
import type { PassportData } from "@/lib/ocr/passport-parser";

export function DealRequisites({ onSaved, onReadyChange }: { onSaved: () => void; onReadyChange?: (ready: boolean) => void }) {
  const [details, setDetails] = useState<Partial<PassportData> | null>(null);
  const [saved, setSaved] = useState(false);
  const profile = useQuery({ queryKey: queryKeys.profile.current(), queryFn: getProfile });
  const hasSavedDetails = Boolean(profile.data?.firstName && profile.data?.lastName && profile.data?.birthDate && profile.data?.passport?.series && profile.data?.passport?.number && profile.data?.passport?.issuedAt && profile.data?.passport?.issuer && profile.data?.passport?.divisionCode && profile.data?.passport?.birthPlace && profile.data?.passport?.gender);
  useEffect(() => { onReadyChange?.(hasSavedDetails); }, [hasSavedDetails, onReadyChange]);
  const open = (data: Partial<PassportData>) => { setDetails(data); setSaved(false); };
  return <>
    <Card className="deal-requisites">
      <h2>Мои реквизиты для договора</h2>
      <PasteProfileDetails onApply={open} />
      <PassportScanner onApply={open} />
      <Button type="button" variant="outline" className="full-width" onClick={() => open({})}>
        <PenLine size={18} /> Заполнить реквизиты вручную
      </Button>
      {hasSavedDetails ? <Button type="button" variant="outline" className="full-width" onClick={() => open({})}>Выбрать реквизиты из профиля</Button> : null}
      <p>Каждый участник указывает свои реквизиты. Фото паспорта загружать не обязательно.</p>
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
