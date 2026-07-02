import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { ALL_CARDS } from "../data/bank";
import { CATEGORY_BY_ID } from "../data/categories";
import { buildLearnQueue, dueCount } from "../lib/queue";
import { speakPl } from "../lib/tts";
import type { Card, Grade } from "../types";
import CategoryFilter from "../components/CategoryFilter";
import AnswerBlock from "../components/AnswerBlock";
import TapWords from "../components/TapWords";

export default function Learn() {
  const progress = useStore((s) => s.progress);
  const selected = useStore((s) => s.selectedCategories);
  const grade = useStore((s) => s.grade);

  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [started, setStarted] = useState(false);

  const totalDue = useMemo(
    () => dueCount(ALL_CARDS, progress, selected),
    [progress, selected],
  );

  const startSession = useCallback(() => {
    setQueue(buildLearnQueue(ALL_CARDS, progress, selected));
    setIdx(0);
    setRevealed(false);
    setReviewed(0);
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const current = queue[idx];
  const done = started && idx >= queue.length;

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
    if (!started || done || !current) return;
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
  }, [started, done, current, revealed, onGrade]);

  // --- Стартовый экран сессии ---
  if (!started) {
    return (
      <div className="screen">
        <h1 className="h-title">Учить</h1>
        <p className="h-sub">
          Прочитай вопрос → ответь <b>вслух по-польски</b> → проверь себя.
        </p>
        <CategoryFilter />
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>🎓</div>
          <div>
            К повторению сейчас: <b style={{ color: "var(--pl)" }}>{totalDue}</b>
          </div>
          <button
            className="btn primary"
            disabled={totalDue === 0}
            onClick={startSession}
          >
            {totalDue === 0 ? "На сегодня всё ✓" : "Начать сессию"}
          </button>
        </div>
      </div>
    );
  }

  // --- Экран завершения ---
  if (done) {
    return (
      <div className="screen">
        <h1 className="h-title">Сессия завершена 🎉</h1>
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>✅</div>
          <div>
            Повторено карточек: <b>{reviewed}</b>
          </div>
          <button className="btn primary" onClick={startSession}>
            Ещё раунд
          </button>
          <button className="btn ghost" onClick={() => setStarted(false)}>
            К выбору тем
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
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
