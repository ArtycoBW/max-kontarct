export interface SpeechResult { isFinal: boolean; 0?: { transcript: string } }
export interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
export interface BrowserSpeechRecognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type SpeechConstructor = new () => BrowserSpeechRecognition;
export function speechConstructor(): SpeechConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}
export function appendTranscript(base: string, text: string, maxLength = 500, sentenceBreak = false) {
  const words = text.replace(/\s+/g, " ").trim();
  const upperFirst = (value: string) => value.replace(/^(\s*)([\p{L}])/u, (_, spaces: string, letter: string) => spaces + letter.toLocaleUpperCase("ru-RU"));
  const lowerFirst = (value: string) => value.replace(/^(\s*)([\p{L}])/u, (_, spaces: string, letter: string) => spaces + letter.toLocaleLowerCase("ru-RU"));
  const sentenceEnd = /[.!?…]["')\]]*$/.test(base.trim());
  if (!words) return base.slice(0, maxLength);
  if (!base.trim()) return upperFirst(words).slice(0, maxLength);
  if (sentenceBreak && !sentenceEnd && /^[\p{L}]/u.test(words)) return `${base.trimEnd()}. ${upperFirst(words)}`.slice(0, maxLength);
  return `${base}${/\s$/.test(base) ? "" : " "}${sentenceEnd ? upperFirst(words) : lowerFirst(words)}`.slice(0, maxLength);
}

/** Same incremental draft/preview and 1.2 s sentence pauses as the supplied Arbit implementation. */
export function speechDraft(base: string, maxLength: number) {
  let committed = base;
  let preview = "";
  let lastFinalAt: number | null = null;
  const finalized = new Set<number>();
  return (event: SpeechEvent, now = Date.now()) => {
    let final = "", interim = "";
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        // Protect against repeated final events without duplicating previously committed words.
        if (!finalized.has(index)) { final += text; finalized.add(index); }
      } else interim += text;
    }
    const sentenceBreak = lastFinalAt !== null && now - lastFinalAt >= 1200;
    if (final) {
      committed = appendTranscript(committed, final, maxLength, sentenceBreak);
      preview = appendTranscript(preview, final, maxLength, sentenceBreak);
      lastFinalAt = now;
    }
    return {
      value: appendTranscript(committed, interim, maxLength, !final && sentenceBreak),
      preview: appendTranscript(preview, interim, maxLength, !final && sentenceBreak),
    };
  };
}
export function speechError(code: string) {
  if (["not-allowed", "service-not-allowed"].includes(code)) return "Доступ к микрофону или распознаванию запрещён. Проверьте разрешения браузера / MAX или используйте микрофон на клавиатуре.";
  if (code === "no-speech") return "Речь не обнаружена. Попробуйте ещё раз и говорите ближе к микрофону.";
  if (code === "audio-capture") return "Микрофон недоступен. Проверьте подключение и разрешения.";
  if (code === "language-not-supported") return "Браузер не поддерживает распознавание на русском. Можно использовать голосовой ввод клавиатуры.";
  if (code === "network") return "Сервис распознавания браузера недоступен по сети. Попробуйте другую сеть или микрофон на клавиатуре телефона.";
  if (code === "aborted") return "Браузер прервал голосовой ввод. Попробуйте снова или используйте микрофон на клавиатуре телефона.";
  return "Не удалось распознать речь. Проверьте интернет или используйте голосовой ввод клавиатуры.";
}
