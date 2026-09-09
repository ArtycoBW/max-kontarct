"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "./button";
import { Modal } from "./modal";
import { appendTranscript, speechConstructor, speechError, type BrowserSpeechRecognition } from "@/lib/voice/speech-recognition";

export function VoiceInput({ value, onChange, disabled, maxLength = 500 }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; maxLength?: number;
}) {
  const current = useRef({ value, onChange });
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState("");
  const [interim, setInterim] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const allowed = useRef(false);
  useEffect(() => { current.current = { value, onChange }; }, [value, onChange]);
  useEffect(() => { if (disabled) recognition.current?.abort(); }, [disabled]);
  useEffect(() => () => {
    const engine = recognition.current;
    recognition.current = null;
    if (timer.current) clearTimeout(timer.current);
    engine?.abort();
  }, []);

  const stop = () => {
    const engine = recognition.current;
    if (!engine) return;
    if (timer.current) clearTimeout(timer.current);
    // Give the browser time to deliver the final words, but do not leave a stuck mic UI.
    timer.current = setTimeout(() => {
      if (recognition.current !== engine) return;
      recognition.current = null; setActive(false); setInterim(""); engine.abort();
    }, 1500);
    try { engine.stop(); } catch { engine.abort(); }
  };

  const start = () => {
    const Recognition = speechConstructor();
    if (!Recognition) { setNotice("В этом браузере / версии MAX голосовое распознавание недоступно. Используйте микрофон на клавиатуре телефона или введите текст вручную."); return; }
    if (recognition.current || disabled) return;
    const base = current.current.value;
    let lastWritten = base;
    const engine = new Recognition();
    recognition.current = engine;
    engine.lang = "ru-RU"; engine.continuous = true; engine.interimResults = true; engine.maxAlternatives = 1;
    setNotice(""); setInterim(""); setActive(true);
    const finish = () => {
      if (recognition.current !== engine) return;
      recognition.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setActive(false); setInterim("");
    };
    engine.onstart = () => { if (recognition.current === engine) setActive(true); };
    engine.onend = finish;
    engine.onerror = event => { if (recognition.current !== engine) return; if (event.error !== "aborted") setNotice(speechError(event.error)); finish(); engine.abort(); };
    engine.onresult = event => {
      if (recognition.current !== engine) return;
      if (current.current.value !== lastWritten) { finish(); engine.abort(); return; } // Preserve manual edits.
      const results = Array.from(event.results);
      const final = results.filter(item => item.isFinal).map(item => item[0]?.transcript ?? "").join(" ");
      const preview = results.filter(item => !item.isFinal).map(item => item[0]?.transcript ?? "").join(" ");
      lastWritten = appendTranscript(base, final, maxLength);
      current.current.value = lastWritten;
      current.current.onChange(lastWritten);
      setInterim(preview);
      if (lastWritten.length >= maxLength) { setNotice(`Достигнут лимит: ${maxLength} символов.`); stop(); }
    };
    try {
      engine.start();
      timer.current = setTimeout(() => { if (recognition.current === engine) { stop(); setNotice("Запись остановлена через минуту. При необходимости продолжите диктовку."); } }, 60_000);
    } catch { finish(); engine.abort(); setNotice("Не удалось включить микрофон. Попробуйте голосовой ввод клавиатуры."); }
  };
  return <div className="voice-input">
    <Button type="button" variant="ghost" disabled={disabled && !active} aria-pressed={active} onClick={() => {
      if (active) { stop(); return; }
      if (!speechConstructor()) { start(); return; }
      if (allowed.current) start(); else setConsentOpen(true);
    }}>{active ? <><Square size={14} /> Остановить диктовку</> : <><Mic size={16} /> Продиктовать</>}</Button>
    {active ? <p role="status">{interim || "Слушаю… Говорите по-русски."}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Голосовой ввод"
      footer={<Button className="full-width" type="button" onClick={() => { allowed.current = true; setConsentOpen(false); start(); }}>Включить микрофон</Button>}>
      <p>Речь распознаёт браузер. В зависимости от браузера аудио может передаваться его сервису распознавания. Макс-Контракт не записывает и не хранит аудио.</p>
      <p>Не диктуйте паспортные данные и другие личные реквизиты. Полученный текст можно исправить перед отправкой.</p>
    </Modal>
  </div>;
}
