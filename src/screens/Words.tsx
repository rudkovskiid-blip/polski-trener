import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { speakPl, ttsSupported } from "../lib/tts";
import { isDue } from "../lib/scheduler";
import { shuffle } from "../lib/queue";
import type { Grade, SavedWord } from "../types";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU");
}

// Вкладка «Словарь»: слова, добавленные тапом из ответов,
// с повторением по тому же FSRS-расписанию, что и карточки.
export default function Words() {
  const words = useStore((s) => s.words);
  const removeWord = useStore((s) => s.removeWord);

  const [reviewing, setReviewing] = useState(false);

  const list = useMemo(
    () => Object.values(words).sort((a, b) => b.addedAt - a.addedAt),
    [words],
  );
  const due = useMemo(() => list.filter((w) => isDue(w.progress)), [list]);

  const onDelete = (w: SavedWord) => {
    if (confirm(`Удалить «${w.word}» из словаря?`)) removeWord(w.id);
  };

  if (reviewing) {
    return <WordSession onExit={() => setReviewing(false)} />;
  }

  return (
    <div className="screen">
      <h1 className="h-title">Словарь</h1>
      <p className="h-sub">
        Тапни слово в любом польском ответе → «В словарь». Здесь эти слова
        повторяются по интервалам, как карточки.
      </p>

      <button
        className="btn primary"
        style={{ marginBottom: 14 }}
        disabled={due.length === 0}
        onClick={() => setReviewing(true)}
      >
        {list.length === 0
          ? "Добавь первое слово из ответа"
          : due.length === 0
            ? "Все слова повторены ✓"
            : `🎓 Повторять слова (${due.length})`}
      </button>

      <div className="stat-grid">
        <div className="stat">
          <div className="num">{list.length}</div>
          <div className="cap">слов в словаре</div>
        </div>
        <div className="stat">
          <div className="num">{due.length}</div>
          <div className="cap">к повторению</div>
        </div>
        <div className="stat">
          <div className="num">{list.length - due.length}</div>
          <div className="cap">отдыхают</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <div className="big">📔</div>
          Словарь пуст. Открой любой ответ на вкладке «Учить», тапни
          непонятное слово и нажми «＋ В словарь».
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {list.map((w) => (
            <div key={w.id} className="wd-row">
              <div className="wd-body">
                <div className="wd-head">
                  <span
                    className="wd-word"
                    onClick={() => ttsSupported() && speakPl(w.word, { rate: 0.75 })}
                  >
                    {w.word} {ttsSupported() && <span className="wd-spk">🔊</span>}
                  </span>
                  {isDue(w.progress) && <span className="wd-due">к повторению</span>}
                </div>
                <div className="wd-tr">{w.translation}</div>
                {w.context && <div className="wd-ctx">{w.context}</div>}
                <div className="wd-date">добавлено {fmtDate(w.addedAt)}</div>
              </div>
              <button className="wd-del" title="Удалить слово" onClick={() => onDelete(w)}>
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Сессия повторения слов: слово по-польски → вспомни перевод → самооценка.
function WordSession({ onExit }: { onExit: () => void }) {
  const words = useStore((s) => s.words);
  const gradeWord = useStore((s) => s.gradeWord);

  const [queue, setQueue] = useState<string[]>(() =>
    shuffle(Object.values(words).filter((w) => isDue(w.progress)).map((w) => w.id)),
  );
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const current = queue[idx] ? words[queue[idx]] : undefined;
  const done = idx >= queue.length;

  const onGrade = (g: Grade) => {
    if (!current) return;
    gradeWord(current.id, g);
    setReviewed((r) => r + 1);
    // «Не вспомнил» — слово вернётся в конец текущей сессии.
    if (g === "again") setQueue((q) => [...q, current.id]);
    setIdx((i) => i + 1);
    setRevealed(false);
  };

  if (done || !current) {
    return (
      <div className="screen">
        <h1 className="h-title">Слова повторены 🎉</h1>
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>📔</div>
          <div>
            Повторено слов: <b>{reviewed}</b>
          </div>
          <button className="btn ghost" onClick={onExit}>
            К словарю
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="exam-progress">
        <span style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>
      <div className="learn-wrap">
        <div className="card">
          <span className="q-cat">📔 Словарь · {idx + 1}/{queue.length}</span>
          <div className="q-ru" style={{ marginTop: 10 }}>
            {current.word}{" "}
            {ttsSupported() && (
              <span
                className="speak-inline"
                onClick={() => speakPl(current.word, { rate: 0.75 })}
              >
                🔊
              </span>
            )}
          </div>

          {!revealed ? (
            <p className="hint" style={{ marginTop: 14 }}>
              Вспомни перевод, потом проверь себя.
            </p>
          ) : (
            <div className="answer">
              <div className="a-block">
                <div className="lbl">Перевод</div>
                <div className="a-ru">{current.translation}</div>
              </div>
              {current.context && (
                <div className="a-block">
                  <div className="lbl">Контекст</div>
                  <div className="wd-ctx" style={{ marginTop: 2 }}>{current.context}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {!revealed ? (
          <button className="btn primary" onClick={() => setRevealed(true)}>
            Показать перевод
          </button>
        ) : (
          <div className="grade-row">
            <button className="grade again" onClick={() => onGrade("again")}>
              Не вспомнил
            </button>
            <button className="grade hard" onClick={() => onGrade("hard")}>
              Частично
            </button>
            <button className="grade good" onClick={() => onGrade("good")}>
              Верно
            </button>
          </div>
        )}
        <button className="btn ghost" onClick={onExit}>
          Выйти
        </button>
      </div>
    </div>
  );
}
