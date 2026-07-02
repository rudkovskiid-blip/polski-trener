import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { ALL_CARDS } from "../data/bank";
import { CATEGORY_BY_ID } from "../data/categories";
import { sampleExam } from "../lib/queue";
import { speakPl } from "../lib/tts";
import type { Card, CategoryId, ExamResult, Grade } from "../types";
import CategoryFilter from "../components/CategoryFilter";
import AnswerBlock from "../components/AnswerBlock";
import TapWords from "../components/TapWords";

type Phase = "setup" | "run" | "result";

const SIZES = [10, 20, 30];

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Exam() {
  const selected = useStore((s) => s.selectedCategories);
  const grade = useStore((s) => s.grade);
  const addExam = useStore((s) => s.addExam);

  const [phase, setPhase] = useState<Phase>("setup");
  const [size, setSize] = useState(20);
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sec, setSec] = useState(0);
  const startRef = useRef(0);
  // тэги результата по каждой карточке
  const [marks, setMarks] = useState<{ card: Card; grade: Grade }[]>([]);

  const poolSize = useMemo(
    () => ALL_CARDS.filter((c) => selected.has(c.category)).length,
    [selected],
  );

  useEffect(() => {
    if (phase !== "run") return;
    const t = setInterval(() => setSec(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    setQueue(sampleExam(ALL_CARDS, selected, size));
    setIdx(0);
    setRevealed(false);
    setMarks([]);
    setSec(0);
    startRef.current = Date.now();
    setPhase("run");
  };

  const current = queue[idx];

  const mark = (g: Grade) => {
    if (!current) return;
    grade(current.id, g); // экзамен тоже идёт в зачёт FSRS
    const nextMarks = [...marks, { card: current, grade: g }];
    setMarks(nextMarks);
    if (idx + 1 >= queue.length) {
      finish(nextMarks);
    } else {
      setIdx(idx + 1);
      setRevealed(false);
    }
  };

  const finish = (allMarks: { card: Card; grade: Grade }[]) => {
    const durationSec = Math.floor((Date.now() - startRef.current) / 1000);
    const correct = allMarks.filter((m) => m.grade === "good").length;
    const partial = allMarks.filter((m) => m.grade === "hard").length;
    const wrong = allMarks.filter((m) => m.grade === "again").length;

    // слабые темы: точность < 60%
    const byCat = new Map<CategoryId, { ok: number; total: number }>();
    for (const m of allMarks) {
      const e = byCat.get(m.card.category) ?? { ok: 0, total: 0 };
      e.total++;
      if (m.grade === "good") e.ok++;
      byCat.set(m.card.category, e);
    }
    const weak: CategoryId[] = [...byCat.entries()]
      .filter(([, v]) => v.ok / v.total < 0.6)
      .map(([k]) => k);

    const result: ExamResult = {
      id: `exam_${Date.now()}`,
      startedAt: startRef.current,
      finishedAt: Date.now(),
      durationSec,
      total: allMarks.length,
      correct,
      partial,
      wrong,
      weakCategories: weak,
    };
    addExam(result);
    setPhase("result");
  };

  // --- Setup ---
  if (phase === "setup") {
    return (
      <div className="screen">
        <h1 className="h-title">Экзамен</h1>
        <p className="h-sub">
          Случайные вопросы вперемешку под таймер — как у чиновника.
        </p>
        <CategoryFilter />
        <div className="panel">
          <div className="lbl" style={{ marginBottom: 8 }}>
            Сколько вопросов
          </div>
          <div className="chips">
            {SIZES.map((n) => (
              <button
                key={n}
                className={"chip" + (size === n ? " on" : "")}
                onClick={() => setSize(n)}
              >
                {n}
              </button>
            ))}
            <button
              className={"chip" + (size === poolSize ? " on" : "")}
              onClick={() => setSize(poolSize)}
            >
              Все ({poolSize})
            </button>
          </div>
        </div>
        <button className="btn primary" disabled={poolSize === 0} onClick={start}>
          Начать экзамен
        </button>
      </div>
    );
  }

  // --- Result ---
  if (phase === "result") {
    const last = useStore.getState().exams[0];
    const acc = last.total ? Math.round((last.correct / last.total) * 100) : 0;
    return (
      <div className="screen">
        <h1 className="h-title">Результат</h1>
        <div className="stat-grid">
          <div className="stat">
            <div className="num">{acc}%</div>
            <div className="cap">точность</div>
          </div>
          <div className="stat">
            <div className="num">{last.correct}</div>
            <div className="cap">верно</div>
          </div>
          <div className="stat">
            <div className="num">{fmt(last.durationSec)}</div>
            <div className="cap">время</div>
          </div>
        </div>
        <div className="panel">
          <div className="row-between">
            <span>✅ Верно</span> <b>{last.correct}</b>
          </div>
          <div className="row-between">
            <span>🟡 Частично</span> <b>{last.partial}</b>
          </div>
          <div className="row-between">
            <span>🔴 Не вспомнил</span> <b>{last.wrong}</b>
          </div>
        </div>
        <div className="panel">
          <div className="lbl" style={{ marginBottom: 6 }}>
            Куда направить силы
          </div>
          {last.weakCategories.length === 0 ? (
            <div className="muted">Слабых тем нет — отличный прогон! 💪</div>
          ) : (
            <div className="chips" style={{ marginBottom: 0 }}>
              {last.weakCategories.map((c) => (
                <span key={c} className="chip on">
                  {CATEGORY_BY_ID[c].emoji} {CATEGORY_BY_ID[c].title_ru}
                </span>
              ))}
            </div>
          )}
        </div>
        <button className="btn primary" onClick={() => setPhase("setup")}>
          Ещё экзамен
        </button>
      </div>
    );
  }

  // --- Run ---
  if (!current) return null;
  const cat = CATEGORY_BY_ID[current.category];
  return (
    <div className="screen">
      <div className="exam-top">
        <span>
          Вопрос {idx + 1} / {queue.length}
        </span>
        <span className="timer">⏱ {fmt(sec)}</span>
      </div>
      <div className="exam-progress">
        <span style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

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
        {revealed && <AnswerBlock card={current} />}
      </div>

      <div style={{ marginTop: 14 }}>
        {!revealed ? (
          <button className="btn primary" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        ) : (
          <div className="grade-row" style={{ position: "static" }}>
            <button className="grade again" onClick={() => mark("again")}>
              Не вспомнил
            </button>
            <button className="grade hard" onClick={() => mark("hard")}>
              Частично
            </button>
            <button className="grade good" onClick={() => mark("good")}>
              Верно
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
