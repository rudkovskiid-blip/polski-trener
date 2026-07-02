import { useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { ALL_CARDS } from "../data/bank";
import { CATEGORIES } from "../data/categories";
import { isMastered } from "../lib/scheduler";
import { downloadBackup, uploadBackup } from "../lib/backup";
import { BANK } from "../data/bank";

export default function Progress() {
  const progress = useStore((s) => s.progress);
  const exams = useStore((s) => s.exams);
  const refresh = useStore((s) => s.refresh);
  const reset = useStore((s) => s.reset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const overall = useMemo(() => {
    const total = ALL_CARDS.length;
    const seen = Object.keys(progress).length;
    let mastered = 0;
    let attempts = 0;
    let correct = 0;
    for (const c of ALL_CARDS) {
      const p = progress[c.id];
      if (p) {
        if (isMastered(p)) mastered++;
        attempts += p.attempts;
        correct += p.correct;
      }
    }
    const acc = attempts ? Math.round((correct / attempts) * 100) : 0;
    return { total, seen, mastered, acc };
  }, [progress]);

  const perCat = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const cards = ALL_CARDS.filter((c) => c.category === cat.id);
        const mastered = cards.filter((c) => isMastered(progress[c.id])).length;
        const seen = cards.filter((c) => progress[c.id]).length;
        const pct = cards.length ? Math.round((mastered / cards.length) * 100) : 0;
        return { cat, total: cards.length, mastered, seen, pct };
      }),
    [progress],
  );

  const onImport = async (file: File) => {
    try {
      await uploadBackup(file);
      await refresh();
      flash("Прогресс импортирован ✓");
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const onReset = async () => {
    if (confirm("Сбросить весь прогресс? Это необратимо (сделай бэкап заранее).")) {
      await reset();
      flash("Прогресс сброшен");
    }
  };

  return (
    <div className="screen">
      <h1 className="h-title">Прогресс</h1>
      <p className="h-sub">Освоено = карточка ушла в долгий интервал (≥ 21 дня).</p>

      <div className="stat-grid">
        <div className="stat">
          <div className="num">
            {overall.mastered}
            <span style={{ fontSize: 16, color: "var(--muted)" }}>/{overall.total}</span>
          </div>
          <div className="cap">освоено</div>
        </div>
        <div className="stat">
          <div className="num">{overall.seen}</div>
          <div className="cap">в работе</div>
        </div>
        <div className="stat">
          <div className="num">{overall.acc}%</div>
          <div className="cap">точность</div>
        </div>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 10 }}>
          По темам
        </div>
        <div className="stack">
          {perCat.map(({ cat, total, mastered, pct }) => (
            <div key={cat.id}>
              <div className="row-between">
                <span>
                  {cat.emoji} {cat.title_ru}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {mastered}/{total}
                </span>
              </div>
              <div className="bar">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {exams.length > 0 && (
        <div className="panel">
          <div className="lbl" style={{ marginBottom: 10 }}>
            Последние экзамены
          </div>
          <div className="stack">
            {exams.slice(0, 5).map((e) => {
              const acc = e.total ? Math.round((e.correct / e.total) * 100) : 0;
              const d = new Date(e.finishedAt);
              return (
                <div key={e.id} className="row-between">
                  <span className="muted" style={{ fontSize: 14 }}>
                    {d.toLocaleDateString("ru-RU")} · {e.total} вопр.
                  </span>
                  <b style={{ color: acc >= 70 ? "var(--green)" : "var(--amber)" }}>
                    {acc}%
                  </b>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 10 }}>
          Бэкап (перенос между iPhone и Mac)
        </div>
        <div className="stack">
          <button
            className="btn ghost"
            onClick={() => downloadBackup(BANK.version)}
          >
            ⬇️ Экспорт прогресса (JSON)
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            ⬆️ Импорт из файла
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <button
            className="btn"
            style={{ color: "var(--red)", background: "transparent", border: "1px solid var(--border)" }}
            onClick={onReset}
          >
            Сбросить прогресс
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
