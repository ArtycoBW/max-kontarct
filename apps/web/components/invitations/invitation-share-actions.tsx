"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { invitationShareDiagnostic, shareInMax } from "@/lib/max/bridge";

export function InvitationShareActions({ text, link, onConfirmed }: {
  text: string;
  link: string;
  onConfirmed: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const attempt = useRef(0);
  const saving = useRef(false);
  useEffect(() => () => { attempt.current++; }, []);

  const send = async (mode: "primary" | "alternate" | "copy") => {
    if (saving.current) return;
    const current = ++attempt.current;
    setPending(true);
    setAttempted(true);
    setNotice("");
    setError("");
    let result;
    try {
      // Keep the native call in this click's synchronous stack.
      if (mode === "copy") {
        await navigator.clipboard.writeText(link);
        result = "copied";
      } else {
        result = await shareInMax(text, link, mode === "alternate");
      }
    } catch (failure) {
      if (attempt.current !== current) return;
      setPending(false);
      if (failure instanceof Error && failure.name === "AbortError") {
        setNotice("Отправка отменена.");
        return;
      }
      setManual(true);
      setError(mode === "copy"
        ? "Буфер обмена недоступен. Выделите ссылку ниже и скопируйте её через меню телефона."
        : `Не удалось открыть отправку. Нажмите «Другой способ отправки» или скопируйте ссылку. ${invitationShareDiagnostic(failure)}`);
      return;
    }
    // A result from a previous, abandoned picker must not change the new UI.
    if (attempt.current !== current) return;
    if (result === "cancelled" || result === "unconfirmed") {
      setPending(false);
      setNotice(result === "cancelled" ? "Отправка отменена." : "MAX не подтвердил отправку. Чтобы продолжить, скопируйте ссылку или дождитесь присоединения второй стороны.");
      return;
    }
    saving.current = true;
    try {
      await onConfirmed();
      if (attempt.current === current) setNotice(result === "copied" ? "Ссылка скопирована. Вставьте её в чат MAX. Можно продолжать." : "Приглашение отправлено.");
    } catch {
      if (attempt.current === current) setError("Не удалось сохранить отметку. Повторите отправку или копирование ссылки.");
    } finally {
      saving.current = false;
      if (attempt.current === current) setPending(false);
    }
  };

  return <div className="invitation-share-actions">
    <Button type="button" className="full-width" disabled={pending} onClick={() => void send("primary")}>{pending ? "Ожидаем ответ MAX…" : "Отправить в MAX"}</Button>
    <Button type="button" className="full-width" variant="secondary" onClick={() => void send("copy")}>Скопировать ссылку</Button>
    {attempted ? <div className="invitation-share-recovery">
      <p>Если окно не появилось, попробуйте другой способ. В системном меню «Поделиться» выберите MAX.</p>
      <Button type="button" className="full-width" variant="outline" onClick={() => void send("alternate")}>Другой способ отправки</Button>
      {!manual ? <Button type="button" variant="ghost" onClick={() => setManual(true)}>Показать ссылку</Button> : null}
    </div> : null}
    {manual ? <label className="form-field"><span>Ссылка-приглашение</span><Textarea readOnly value={link} onFocus={event => event.currentTarget.select()} /><small>Нажмите на ссылку, скопируйте и вставьте в чат MAX. Не пересылайте посторонним. После ручного копирования продолжить можно, когда вторая сторона присоединится.</small></label> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
