// Озвучка польского текста через Web Speech API (speechSynthesis), офлайн на большинстве устройств.

let plVoice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = speechSynthesis.getVoices();
  // Ищем именно польский голос; иначе оставим дефолтный с lang pl-PL.
  plVoice =
    voices.find((v) => v.lang?.toLowerCase().startsWith("pl")) ?? null;
}

export function initTts() {
  if (!("speechSynthesis" in window)) return;
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Есть ли вообще польский голос в системе (для подсказки пользователю).
export function hasPolishVoice(): boolean {
  if (!ttsSupported()) return false;
  return speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith("pl"));
}

export function speakPl(text: string, opts?: { rate?: number; onEnd?: () => void }) {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pl-PL";
  if (plVoice) u.voice = plVoice;
  u.rate = opts?.rate ?? 0.95;
  u.pitch = 1;
  if (opts?.onEnd) {
    // onerror срабатывает и при cancel() от следующего тапа — снимаем подсветку в обоих случаях.
    u.onend = opts.onEnd;
    u.onerror = opts.onEnd;
  }
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
}
