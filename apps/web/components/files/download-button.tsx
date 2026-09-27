"use client";
import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";

export function DownloadButton({ url, filename, children, className, iconOnly = false, variant = "outline" }: { url: string; filename: string; children?: ReactNode; className?: string; iconOnly?: boolean; variant?: "primary" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<{ url: string; filename: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const prepare = async () => {
    setOpen(true); setReady(null); setError(""); setNotice("");
    try {
      const resource = new URL(url, window.location.origin);
      if (resource.origin !== window.location.origin) throw new Error("Недоступный адрес файла");
      setReady(await apiRequest("downloads/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: resource.pathname }) }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось подготовить файл"); }
  };
  const download = async () => {
    if (!ready) return;
    if (Date.parse(ready.expiresAt) <= Date.now()) { setError("Ссылка истекла. Подготовьте файл ещё раз."); setReady(null); return; }
    setPending(true); setError("");
    try {
      // No await/fetch before this native call: preserve Android's user gesture.
      const result = await window.WebApp!.downloadFile!(ready.url, ready.filename);
      if (result && typeof result === "object" && "error" in result) throw new Error("MAX не смог скачать файл. Повторите попытку.");
      setNotice("Файл передан в загрузки MAX.");
    } catch { setError("MAX не смог скачать файл. Повторите попытку или откройте ссылку ниже."); }
    finally { setPending(false); }
  };
  return <>
    <Button asChild variant={variant} className={className} size={iconOnly ? "icon" : "default"}><a href={url} download={filename} aria-label={iconOnly ? `Скачать ${filename}` : undefined} onClick={event => {
      if (window.WebApp && window.WebApp.platform !== "web" && (window.WebApp.platform === "android" || window.WebApp.platform === "ios" || /Android|iPhone|iPad/i.test(navigator.userAgent))) {
        event.preventDefault();
        if (!window.WebApp.downloadFile) { setOpen(true); setReady(null); setNotice(""); setError("Эта версия MAX не поддерживает скачивание. Обновите MAX и откройте мини-приложение заново."); return; }
        void prepare();
      }
    }}><Download size={17} />{!iconOnly ? children ?? "Скачать" : null}</a></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="app-modal"><DialogHeader className="app-modal-header is-stacked"><DialogTitle>Скачать файл</DialogTitle><DialogDescription>{filename}</DialogDescription></DialogHeader><div className="app-modal-body download-actions">
      {!ready && !error ? <p role="status">Подготавливаем защищённую ссылку…</p> : null}
      {ready ? <><Button disabled={pending} onClick={() => void download()}>{pending ? "MAX загружает файл…" : "Скачать на устройство"}</Button><a href={ready.url} referrerPolicy="no-referrer">Открыть ссылку скачивания</a></> : null}
      {notice ? <p role="status">{notice}</p> : null}{error ? <><p role="alert">{error}</p><Button variant="secondary" onClick={() => void prepare()}>Подготовить заново</Button></> : null}
    </div></DialogContent></Dialog>
  </>;
}
