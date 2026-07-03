import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, useAllCards } from "../store/useStore";
import { CATEGORY_BY_ID } from "../data/categories";
import { sampleExam, shuffle } from "../lib/queue";
import { speakPl } from "../lib/tts";
import { BOSS, bossCooldownDays } from "../lib/game";
import type { Card, CategoryId, ExamResult, Grade } from "../types";
import CategoryFilter from "../components/CategoryFilter";
import AnswerBlock from "../components/AnswerBlock";
import TapWords from "../components/TapWords";

type Phase = "setup" | "run" | "result" | "bossResult";
type Mode = "exam" | "boss";

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
  const notebook = useStore((s) => s.notebook);
  const game = useStore((s) => s.game);
  const bossFinished = useStore((s) => s.bossFinished);
  const allCards = useAllCards();

  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<Mode>("exam");
  const [size, setSize] = useState(20);
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sec, setSec] = useState(0);
  const startRef = useRef(0);
  const [marks, setMarks] = useState<{ card: Card; grade: Grade }[]>([]);
  // босс
  const [qSec, setQSec] = useState<number>(BOSS.secPerQuestion);
  const [timedOut, setTimedOut] = useState(false);
  const [fails, setFails] = useState(0);
  const [bossWon, setBossWon] = useState(false);

  const poolSize = useMemo(
    () => allCards.filter((c) => selected.has(c.category)).length,
    [allCards, selected],
  );
  const markedCards = useMemo(
    () => allCards.filter((c) => notebook[c.id]),
    [allCards, notebook],
  );
  const cooldown = bossCooldownDays(game);

  // Секундомер обычного экзамена.
  useEffect(() => {
    if (phase !== "run" || mode !== "exam") return;
    const t = setInterval(
      () => setSec(Math.floor((Date.now() - startRef.current) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [phase, mode]);

  // Таймер на вопрос в режиме босса.
  useEffect(() => {
    if (phase !== "run" || mode !== "boss" || revealed) return;
    setQSec(BOSS.secPerQuestion);
    const t = setInterval(() => {
      setQSec((s) => {
        if (s <= 1) {
          clearInterval(t);
          setTimedOut(true);
          setRevealed(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, idx]);

  const start = () => {
    setMode("exam");
    setQueue(sampleExam(allCards, selected, size));
    setIdx(0);
    setRevealed(false);
    setMarks([]);
    setSec(0);
    startRef.current = Date.now();
    setPhase("run");
  };

  const startBoss = () => {
    setMode("boss");
    setQueue(shuffle(markedCards).slice(0, BOSS.size));
    setIdx(0);
    setRevealed(false);
    setTimedOut(false);
    setFails(0);
    setMarks([]);
    startRef.current = Date.now();
    setPhase("run");
  };

  const current = queue[idx];

  const mark = (g: Grade) => {
    if (!current) return;
    grade(current.id, g); // экзамен и босс идут в зачёт FSRS
    const nextMarks = [...marks, { card: current, grade: g }];
    setMarks(nextMarks);

    if (mode === "boss") {
      const nextFails = fails + (g === "again" ? 1 : 0);
      setFails(nextFails);
      const lost = nextFails > BOSS.failsAllowed;
      const finished = idx + 1 >= queue.length;
      if (lost || finished) {
        const win = !lost;
        setBossWon(win);
        bossFinished(win);
        setPhase("bossResult");
      } else {
        setIdx(idx + 1);
        setRevealed(false);
        setTimedOut(false);
      }
      return;
    }

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
    const bossBlocked =
      markedCards.length < BOSS.minMarked ? `нужно ${BOSS.minMarked}+ вопросов в тетрадке` :
      cooldown > 0 ? `Консул вернётся через ${cooldown} дн.` : null;
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

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="row-between">
            <b>⚔️ Босс: Консул</b>
            <span className="muted" style={{ fontSize: 13 }}>
              побед: {game.bossWins}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 10px" }}>
            {BOSS.size} вопросов из твоей тетрадки, {BOSS.secPerQuestion} секунд на
            вопрос, допустимо {BOSS.failsAllowed} ошибки. Победа — +100 XP, Консул
            уходит на неделю.
          </p>
          <button
            className="btn ghost"
            disabled={!!bossBlocked}
            onClick={startBoss}
          >
            {bossBlocked ? `⚔️ ${bossBlocked}` : "⚔️ Вызвать Консула"}
          </button>
        </div>
      </div>
    );
  }

  // --- Результат босса ---
  if (phase === "bossResult") {
    const good = marks.filter((m) => m.grade !== "again").length;
    return (
      <div className="screen">
        <h1 className="h-title">{bossWon ? "Консул повержен! 🏆" : "Консул победил… 🪦"}</h1>
        <div className="stat-grid">
          <div className="stat">
            <div className="num">{good}</div>
            <div className="cap">верно</div>
          </div>
          <div className="stat">
            <div className="num">{fails}</div>
            <div className="cap">ошибок</div>
          </div>
          <div className="stat">
            <div className="num">{bossWon ? "+100" : "0"}</div>
            <div className="cap">XP</div>
          </div>
        </div>
        <div className="panel">
          {bossWon ? (
            <div>
              Уряд взят штурмом. Консул вернётся через {BOSS.cooldownDays} дней —
              к тому времени подтяни слабые темы. Побед всего: <b>{game.bossWins}</b>.
            </div>
          ) : (
            <div>
              В этот раз не хватило. Прогони слабые вопросы в «Учить» и вызывай
              Консула снова — он не уходит после поражения.
            </div>
          )}
        </div>
        <button className="btn primary" onClick={() => setPhase("setup")}>
          {bossWon ? "Забрать трофей" : "Вернуться к подготовке"}
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
  const isBoss = mode === "boss";
  const hpPct = Math.round(((queue.length - idx) / queue.length) * 100);
  return (
    <div className="screen">
      <div className="exam-top">
        <span>
          {isBoss ? "⚔️ " : ""}Вопрос {idx + 1} / {queue.length}
          {isBoss && (
            <span className="muted"> · ошибок {fails}/{BOSS.failsAllowed}</span>
          )}
        </span>
        <span className="timer" style={isBoss && qSec <= 5 && !revealed ? { color: "var(--red)" } : undefined}>
          ⏱ {isBoss ? `${qSec} с` : fmt(sec)}
        </span>
      </div>
      {isBoss && (
        <div className="boss-hp">
          <span style={{ width: `${hpPct}%` }} />
        </div>
      )}
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
        {revealed && timedOut && (
          <div className="boss-timeout">⏱ Время вышло!</div>
        )}
        {revealed && <AnswerBlock card={current} />}
      </div>

      <div style={{ marginTop: 14 }}>
        {!revealed ? (
          <button className="btn primary" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        ) : isBoss ? (
          <div className="grade-row" style={{ position: "static" }}>
            <button className="grade again" onClick={() => mark("again")}>
              Nie znałem ✗
            </button>
            {!timedOut && (
              <button className="grade good" onClick={() => mark("good")}>
                Znałem ✓
              </button>
            )}
          </div>
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
