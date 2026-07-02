import { useMemo, useState } from "react";
import { speakPl, ttsSupported } from "../lib/tts";

// Разбираем текст на слова, сохраняя пробелы и пунктуацию как есть.
// Тап по слову озвучивает его медленнее обычного — для заучивания произношения.
const WORD_TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export default function TapWords({ text }: { text: string }) {
  const [active, setActive] = useState<number | null>(null);
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);

  if (!ttsSupported()) return <>{text}</>;

  const onTap = (i: number, token: string) => {
    const word = token.replace(WORD_TRIM, "");
    if (!word) return;
    setActive(i);
    speakPl(word, {
      rate: 0.75,
      onEnd: () => setActive((a) => (a === i ? null : a)),
    });
  };

  return (
    <>
      {tokens.map((t, i) =>
        /^\s*$/.test(t) ? (
          t
        ) : (
          <span
            key={i}
            className={"tap-word" + (active === i ? " speaking" : "")}
            onClick={(e) => {
              e.stopPropagation();
              onTap(i, t);
            }}
          >
            {t}
          </span>
        ),
      )}
    </>
  );
}
