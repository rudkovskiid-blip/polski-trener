import { useMemo, useState } from "react";
import { useStore, useAllCards } from "../store/useStore";
import { buildLearnQueue, dueCount } from "../lib/queue";
import CategoryFilter from "../components/CategoryFilter";
import StudySession from "../components/StudySession";

export default function Learn() {
  const progress = useStore((s) => s.progress);
  const selected = useStore((s) => s.selectedCategories);
  const allCards = useAllCards();

  const [started, setStarted] = useState(false);

  const totalDue = useMemo(
    () => dueCount(allCards, progress, selected),
    [allCards, progress, selected],
  );

  // --- Сессия ---
  if (started) {
    return (
      <StudySession
        build={() => buildLearnQueue(allCards, progress, selected)}
        onExit={() => setStarted(false)}
        exitLabel="К выбору тем"
      />
    );
  }

  // --- Стартовый экран ---
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
          onClick={() => setStarted(true)}
        >
          {totalDue === 0 ? "На сегодня всё ✓" : "Начать сессию"}
        </button>
      </div>
    </div>
  );
}
