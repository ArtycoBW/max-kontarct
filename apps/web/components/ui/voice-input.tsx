"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "./button";
import { Modal } from "./modal";
import { speechDraft, speechConstructor, speechError, type BrowserSpeechRecognition } from "@/lib/voice/speech-recognition";

export function VoiceInput({ value, onChange, inputId, disabled, maxLength = 500, iconOnly = false, onActiveChange }: {
  value: string; onChange: (value: string) => void; inputId: string; disabled?: boolean; maxLength?: number;
  iconOnly?: boolean; onActiveChange?: (active: boolean) => void;
}) {
  const current = useRef({ value, onChange });
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const stopSession = useRef<(() => void) | null>(null);
  const abortSession = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "listening">("idle");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const allowed = useRef(false);
  const active = status !== "idle";
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  // A newly created parent callback must not overwrite text from the current recognition event.
  useEffect(() => { current.current.value = value; }, [value]);
  useEffect(() => { current.current.onChange = onChange; }, [onChange]);
  useEffect(() => { if (disabled) abortSession.current?.(); }, [disabled]);
  useEffect(() => () => { abortSession.current?.(); }, [inputId]);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); stopSession.current?.(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  const start = () => {
    const Recognition = speechConstructor();
    if (!Recognition) { setNotice("В этом браузере / версии MAX голосовое распознавание недоступно. Используйте микрофон на клавиатуре телефона или введите текст вручную."); return; }
    if (recognition.current || disabled) return;
    let lastWritten = current.current.value;
    const updateDraft = speechDraft(lastWritten, maxLength);
    const engine = new Recognition();
    recognition.current = engine;
    engine.lang = "ru-RU";
    engine.continuous = true;
    engine.interimResults = true;
    engine.maxAlternatives = 1;
    let stopping = false, receivedText = false;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let focusFrame: number | null = null;
    setNotice(""); setPreview(""); setStatus("starting");
    const focusInput = () => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        const input = document.getElementById(inputId);
        if (!(input instanceof HTMLTextAreaElement) || input.disabled) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      });
    };
    const finish = () => {
      if (recognition.current !== engine) return;
      recognition.current = null; stopSession.current = null; abortSession.current = null;
      if (stopTimer) clearTimeout(stopTimer);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      engine.onstart = null; engine.onresult = null; engine.onerror = null; engine.onend = null;
      setStatus("idle"); setPreview("");
    };
    const abort = () => { finish(); try { engine.abort(); } catch { /* Already ended. */ } };
    const stop = () => {
      if (stopping || recognition.current !== engine) return;
      stopping = true;
      // Only a user-requested stop has a timeout, to flush final words and release a stuck engine.
      stopTimer = setTimeout(abort, 1500);
      try { engine.stop(); } catch { abort(); }
    };
    stopSession.current = stop;
    abortSession.current = abort;
    engine.onstart = () => { if (recognition.current === engine) { setStatus("listening"); focusInput(); } };
    engine.onend = () => {
      if (recognition.current !== engine) return;
      if (!stopping && !receivedText) setNotice("Браузер завершил голосовой ввод без текста. Проверьте доступ к микрофону в браузере / MAX. На телефоне можно использовать микрофон на клавиатуре.");
      finish();
    };
    engine.onerror = event => {
      if (recognition.current !== engine) return;
      if (!stopping || event.error !== "aborted") setNotice(speechError(event.error));
      abort();
    };
    engine.onresult = event => {
      if (recognition.current !== engine) return;
      if (current.current.value !== lastWritten) { abort(); return; } // Never overwrite manual edits.
      const next = updateDraft(event);
      receivedText ||= Boolean(next.preview.trim());
      lastWritten = next.value;
      current.current.value = lastWritten;
      current.current.onChange(lastWritten);
      setPreview(next.preview);
      focusInput();
      if (lastWritten.length >= maxLength) { setNotice(`Достигнут лимит: ${maxLength} символов.`); stop(); }
    };
    // Synchronous start inside the click handler preserves the browser's user activation.
    try { engine.start(); } catch { abort(); setNotice("Не удалось включить микрофон. Проверьте разрешения браузера / MAX или используйте голосовой ввод клавиатуры."); }
  };
  return <div className={iconOnly ? "voice-input voice-input-icon" : "voice-input"}>
    {active ? <p role="status">{status === "starting" ? "Подключаю микрофон…" : iconOnly ? "Слушаю… Нажмите стоп, чтобы закончить диктовку." : preview || "Слушаю… Говорите по-русски."}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Голосовой ввод"
      trigger={<Button type="button" variant="ghost" size={iconOnly ? "icon" : "default"} aria-label={iconOnly ? active ? "Остановить диктовку" : "Продиктовать сообщение" : undefined} title={iconOnly ? active ? "Остановить диктовку" : "Продиктовать сообщение" : undefined} disabled={disabled && !active} aria-pressed={active} onClick={() => {
        if (active) { stopSession.current?.(); return; }
        if (!speechConstructor()) { start(); return; }
        if (allowed.current) start(); else setConsentOpen(true);
      }}>{active ? <><Square size={iconOnly ? 18 : 14} />{!iconOnly && " Остановить диктовку"}</> : <><Mic size={iconOnly ? 20 : 16} />{!iconOnly && " Продиктовать"}</>}</Button>}
      footer={<Button className="full-width" type="button" onClick={() => { allowed.current = true; setConsentOpen(false); start(); }}>Включить микрофон</Button>}>
      <p>Речь распознаёт браузер. В зависимости от браузера аудио может передаваться его сервису распознавания. Макс-Контракт не записывает и не хранит аудио.</p>
      <p>Не диктуйте паспортные данные и другие личные реквизиты. Полученный текст можно исправить перед отправкой.</p>
    </Modal>
  </div>;
}
