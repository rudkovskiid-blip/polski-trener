import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { CATEGORY_BY_ID } from "../data/categories";
import { speakPl } from "../lib/tts";
import type { Card, Grade } from "../types";
import AnswerBlock from "./AnswerBlock";
import TapWords from "./TapWords";

// Проигрыватель сессии карточек: показать ответ → самооценка (again/hard/good).
// Используется и в «Учить» (очередь по расписанию), и в «Тетрадке» (отмеченные).
// `build` вызывается при старте и на «Ещё раунд» — возвращает свежую очередь.
export default function StudySession({
  build,
  onExit,
  exitLabel = "Выйти",
  doneTitle = "Сессия завершена 🎉",
}: {
  build: () => Card[];
  onExit: () => void;
  exitLabel?: string;
  doneTitle?: string;
}) {
  const grade = useStore((s) => s.grade);

  // Держим свежий build в ref: «Ещё раунд» соберёт очередь по актуальному прогрессу.
  const buildRef = useRef(build);
  buildRef.current = build;

  const [queue, setQueue] = useState<Card[]>(() => build());
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const current = queue[idx];
  const done = idx >= queue.length;

  const restart = useCallback(() => {
    setQueue(buildRef.current());
    setIdx(0);
    setRevealed(false);
    setReviewed(0);
  }, []);

  const onGrade = useCallback(
    (g: Grade) => {
      if (!current) return;
      grade(current.id, g);
      setReviewed((r) => r + 1);
      // «Не вспомнил» — вернуть карточку в конец текущей сессии.
      if (g === "again") setQueue((q) => [...q, current]);
      setIdx((i) => i + 1);
      setRevealed(false);
    },
    [current, grade],
  );

  // Клавиатура (Mac): пробел — показать ответ, 1/2/3 — оценка.
  useEffect(() => {
    if (done || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
      } else if (revealed && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        onGrade(e.key === "1" ? "again" : e.key === "2" ? "hard" : "good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, current, revealed, onGrade]);

  if (done) {
    return (
      <div className="screen">
        <h1 className="h-title">{doneTitle}</h1>
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>✅</div>
          <div>
            Повторено карточек: <b>{reviewed}</b>
          </div>
          <button className="btn primary" onClick={restart}>
            Ещё раунд
          </button>
          <button className="btn ghost" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    // Пустая очередь — сразу выходим на экран завершения через restart-состояние.
    return (
      <div className="screen">
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>📭</div>
          <div>Здесь пока нет карточек.</div>
          <button className="btn ghost" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    );
  }

  const cat = CATEGORY_BY_ID[current.category];

  return (
    <div className="screen">
      <div className="exam-progress">
        <span style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>
      <div className="learn-wrap">
        <div className="card">
          <span className="q-cat">
            {cat.emoji} {cat.title_ru}
          </span>
          <div className="q-ru">{current.q_ru}</div>
          {current.q_pl && (
            <div className="q-pl">
              <TapWords text={current.q_pl} />{" "}
              <span className="speak-inline" onClick={() => speakPl(current.q_pl!)}>
                🔊
              </span>
            </div>
          )}

          {!revealed ? (
            <p className="hint" style={{ marginTop: 14 }}>
              Ответь вслух, потом открой эталон.
            </p>
          ) : (
            <AnswerBlock card={current} />
          )}
        </div>

        {!revealed ? (
          <button className="btn primary" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        ) : (
          <div className="grade-row">
            <button className="grade again" onClick={() => onGrade("again")}>
              Не вспомнил<small>1</small>
            </button>
            <button className="grade hard" onClick={() => onGrade("hard")}>
              Частично<small>2</small>
            </button>
            <button className="grade good" onClick={() => onGrade("good")}>
              Верно<small>3</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
