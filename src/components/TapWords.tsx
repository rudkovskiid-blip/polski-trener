import { useMemo, useState } from "react";
import { speakPl, ttsSupported } from "../lib/tts";
import { lookupTranslation, normalizeWord } from "../lib/dict";
import { useStore } from "../store/useStore";

// Разбираем текст на слова, сохраняя пробелы и пунктуацию как есть.
// Тап по слову: озвучка (медленнее обычного) + всплывашка с переводом
// и кнопкой «В словарь» — слово попадает на вкладку «Словарь» для заучивания.

interface Popup {
  idx: number; // индекс токена — для подсветки
  word: string; // слово без пунктуации, с оригинальным регистром
}

export default function TapWords({
  text,
  context,
}: {
  text: string;
  // Предложение-контекст, которое сохраняем вместе со словом (по умолчанию весь text).
  context?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);

  const words = useStore((s) => s.words);
  const addWord = useStore((s) => s.addWord);

  const onTap = (i: number, token: string) => {
    const word = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word) return;
    setPopup({ idx: i, word });
    if (ttsSupported()) {
      setActive(i);
      speakPl(word, {
        rate: 0.75,
        onEnd: () => setActive((a) => (a === i ? null : a)),
      });
    }
  };

  const norm = popup ? normalizeWord(popup.word) : "";
  const saved = norm ? words[norm] : undefined;
  const translation = popup
    ? (saved?.translation && saved.translation !== "—" ? saved.translation : null) ??
      lookupTranslation(popup.word)
    : null;

  const onAdd = async () => {
    if (!popup) return;
    await addWord({
      word: popup.word,
      translation: translation ?? "—",
      context: context ?? text,
    });
    setPopup(null);
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

      {popup && (
        <>
          <div className="word-backdrop" onClick={() => setPopup(null)} />
          <div className="word-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row-between">
              <div className="w-word">{popup.word}</div>
              <button className="w-close" onClick={() => setPopup(null)}>
                ✕
              </button>
            </div>
            <div className={"w-tr" + (translation ? "" : " none")}>
              {translation ?? "Перевода нет в словаре банка"}
            </div>
            <div className="w-btns">
              {ttsSupported() && (
                <button
                  className="speak-btn"
                  onClick={() => speakPl(popup.word, { rate: 0.75 })}
                >
                  🔊 Ещё раз
                </button>
              )}
              {saved ? (
                <span className="w-saved">✓ Уже в словаре</span>
              ) : (
                <button className="btn primary w-add" onClick={onAdd}>
                  ＋ В словарь
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
