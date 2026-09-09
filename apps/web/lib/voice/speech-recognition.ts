export interface SpeechResult { isFinal: boolean; 0?: { transcript: string } }
export interface BrowserSpeechRecognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type SpeechConstructor = new () => BrowserSpeechRecognition;
export function speechConstructor(): SpeechConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}
export function appendTranscript(base: string, text: string, maxLength = 500) {
  const words = text.replace(/\s+/g, " ").trim();
  return (words ? [base.trimEnd(), words].filter(Boolean).join(" ") : base).slice(0, maxLength);
}
export function speechError(code: string) {
  if (["not-allowed", "service-not-allowed"].includes(code)) return "Доступ к микрофону или распознаванию запрещён. Проверьте разрешения браузера / MAX или используйте микрофон на клавиатуре.";
  if (code === "no-speech") return "Речь не обнаружена. Попробуйте ещё раз и говорите ближе к микрофону.";
  if (code === "audio-capture") return "Микрофон недоступен. Проверьте подключение и разрешения.";
  if (code === "language-not-supported") return "Браузер не поддерживает распознавание на русском. Можно использовать голосовой ввод клавиатуры.";
  return "Не удалось распознать речь. Проверьте интернет или используйте голосовой ввод клавиатуры.";
}
