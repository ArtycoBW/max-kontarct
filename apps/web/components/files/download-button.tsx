"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";
import { downloadFilename } from "@/lib/files/download-filename";
import { nativeDownloadResult } from "@/lib/files/native-download-result";

type PreparedDownload = { url: string; filename: string; expiresAt: string };

export function DownloadButton({ url, filename, children, className, iconOnly = false, variant = "outline" }: { url: string; filename: string; children?: ReactNode; className?: string; iconOnly?: boolean; variant?: "primary" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState<PreparedDownload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [preferBrowser, setPreferBrowser] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  const prepare = async () => {
    const current = ++attempt.current;
    setOpen(true); setReady(null); setError(""); setNotice(""); setPending(false);
    // Android clients can acknowledge downloadFile without saving a visible file.
    // Prefer the verified external-browser path; keep native download optional.
    setPreferBrowser(window.WebApp?.platform === "android" || (!window.WebApp?.platform && /Android/i.test(navigator.userAgent)) || !window.WebApp?.downloadFile);
    try {
      const resource = new URL(url, window.location.origin);
      if (resource.origin !== window.location.origin) throw new Error();
      const result = await apiRequest<PreparedDownload>("downloads/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: resource.pathname }) });
      const target = new URL(result.url);
      if (target.protocol !== "https:" || target.pathname !== "/api/v1/downloads/content") throw new Error();
      if (attempt.current === current) setReady(result);
    } catch {
      if (attempt.current === current) setError("Не удалось подготовить файл. Проверьте подключение к интернету и попробуйте ещё раз.");
    }
  };
  const download = async (external = false) => {
    if (!ready) return;
    if (!(Date.parse(ready.expiresAt) > Date.now())) { ++attempt.current; setPending(false); setError("Ссылка истекла. Подготовьте файл ещё раз."); setReady(null); return; }
    const current = ++attempt.current;
    setPending(true); setError(""); setNotice("");
    try {
      // One native operation per fresh click; no fetch before this call.
      if (external) {
        if (!window.WebApp?.openLink) throw new Error();
        const result = await window.WebApp.openLink(ready.url);
        if (result && typeof result === "object" && "error" in result) throw new Error();
        if (attempt.current === current) setNotice("Ссылка передана браузеру. Сохраните файл в открывшемся окне.");
      } else {
        if (!window.WebApp?.downloadFile) throw new Error();
        const result = await window.WebApp.downloadFile(ready.url, downloadFilename(ready.filename));
        const status = nativeDownloadResult(result);
        if (attempt.current === current) {
          if (status === "downloading") setNotice("MAX сообщил о начале загрузки. Если файл не появился, нажмите «Скачать через браузер».");
          else if (status === "cancelled") setNotice("Скачивание отменено. Можно повторить или скачать через браузер.");
          else setError("MAX не подтвердил начало скачивания. Нажмите «Скачать через браузер».");
        }
      }
    } catch {
      if (attempt.current === current) setError(external ? "Не удалось открыть браузер. Попробуйте скачать через MAX или подготовьте файл заново." : "Не удалось начать скачивание. Попробуйте «Скачать через браузер».");
    } finally { if (attempt.current === current) setPending(false); }
  };
  return <>
    <Button asChild variant={variant} className={className} size={iconOnly ? "icon" : "default"}><a href={url} download={filename} aria-label={iconOnly ? `Скачать ${filename}` : undefined} onClick={event => {
      if (window.WebApp && window.WebApp.platform !== "web" && (window.WebApp.platform === "android" || window.WebApp.platform === "ios" || /Android|iPhone|iPad/i.test(navigator.userAgent))) {
        event.preventDefault();
        void prepare();
      }
    }}><Download size={17} />{!iconOnly ? children ?? "Скачать" : null}</a></Button>
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) ++attempt.current; }}><DialogContent className="app-modal"><DialogHeader className="app-modal-header is-stacked"><DialogTitle>Скачать файл</DialogTitle><DialogDescription className="download-filename" title={filename}>{filename}</DialogDescription></DialogHeader><div className="app-modal-body download-actions">
      {!ready && !error ? <p role="status">Подготавливаем файл…</p> : null}
      {ready ? <>
        {preferBrowser ? <Button type="button" onClick={() => void download(true)}>Скачать через браузер</Button> : null}
        {window.WebApp?.downloadFile ? <Button type="button" variant={preferBrowser ? "secondary" : "primary"} disabled={pending} onClick={() => void download()}>{pending ? "Ожидаем ответ…" : "Скачать через MAX"}</Button> : null}
        {!preferBrowser ? <Button type="button" variant="secondary" onClick={() => void download(true)}>Скачать через браузер</Button> : null}
        <p>{preferBrowser ? "Браузер сохранит файл на устройство. В некоторых версиях MAX встроенное скачивание не срабатывает." : "Если загрузка не началась, нажмите «Скачать через браузер»."} Ссылка действует две минуты и открывает только этот файл.</p>
      </> : null}
      {notice ? <p role="status">{notice}</p> : null}{error ? <><p role="alert">{error}</p><Button type="button" variant="secondary" onClick={() => void prepare()}>Подготовить заново</Button></> : null}
    </div></DialogContent></Dialog>
  </>;
}
