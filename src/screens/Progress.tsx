import { useMemo, useRef, useState } from "react";
import { useStore, useAllCards } from "../store/useStore";
import { CATEGORIES } from "../data/categories";
import { isMastered } from "../lib/scheduler";
import { downloadBackup, uploadBackup } from "../lib/backup";
import { BANK } from "../data/bank";
import { rankOf, CITIES, ACHIEVEMENTS, streakDays } from "../lib/game";

export default function Progress() {
  const progress = useStore((s) => s.progress);
  const exams = useStore((s) => s.exams);
  const game = useStore((s) => s.game);
  const refresh = useStore((s) => s.refresh);
  const reset = useStore((s) => s.reset);
  const flashStore = useStore((s) => s.flash);
  const allCards = useAllCards();
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const overall = useMemo(() => {
    const total = allCards.length;
    const seen = Object.keys(progress).length;
    let mastered = 0;
    let attempts = 0;
    let correct = 0;
    for (const c of allCards) {
      const p = progress[c.id];
      if (p) {
        if (isMastered(p)) mastered++;
        attempts += p.attempts;
        correct += p.correct;
      }
    }
    const acc = attempts ? Math.round((correct / attempts) * 100) : 0;
    return { total, seen, mastered, acc };
  }, [allCards, progress]);

  const perCat = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const cards = allCards.filter((c) => c.category === cat.id);
        const mastered = cards.filter((c) => isMastered(progress[c.id])).length;
        const seen = cards.filter((c) => progress[c.id]).length;
        const pct = cards.length ? Math.round((mastered / cards.length) * 100) : 0;
        return { cat, total: cards.length, mastered, seen, pct };
      }),
    [allCards, progress],
  );

  const rank = rankOf(game.xp);
  const streak = streakDays(game.days);
  const citiesOpen = CITIES.filter((c) => overall.mastered >= c.need).length;
  const nextCity = CITIES.find((c) => overall.mastered < c.need) ?? null;
  const achGot = ACHIEVEMENTS.filter((a) => game.ach[a.id]).length;

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
    if (confirm("Сбросить весь прогресс, тетрадку и XP? Это необратимо (сделай бэкап заранее).")) {
      await reset();
      flash("Прогресс сброшен");
    }
  };

  return (
    <div className="screen">
      <h1 className="h-title">Прогресс</h1>
      <p className="h-sub">Освоено = карточка ушла в долгий интервал (≥ 21 дня).</p>

      <div className="panel">
        <div className="row-between">
          <b>
            {rank.cur.emoji} {rank.cur.title}
          </b>
          <span className="muted" style={{ fontSize: 13 }}>
            {game.xp} XP{streak > 1 ? ` · 🔥 ${streak} дн` : ""}
          </span>
        </div>
        <div className="bar xp" style={{ marginTop: 8 }}>
          <span style={{ width: `${rank.pct}%` }} />
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          {rank.next
            ? `До звания «${rank.next.title}» ещё ${rank.next.xp - game.xp} XP`
            : "Максимальное звание!"}
        </div>
      </div>

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
        <div className="row-between" style={{ marginBottom: 8 }}>
          <b>🗺️ Путь к собесу</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {citiesOpen}/{CITIES.length} городов
          </span>
        </div>
        <div className="chips" style={{ marginBottom: 0 }}>
          {CITIES.map((c) => {
            const open = overall.mastered >= c.need;
            const isNext = nextCity?.name === c.name;
            return (
              <button
                key={c.name}
                className={"chip" + (open ? " on" : "")}
                style={isNext ? { borderColor: "var(--pl)" } : undefined}
                onClick={() =>
                  flashStore(
                    open
                      ? `${c.emoji} ${c.name}: ${c.fact}`
                      : `🔒 ${c.name} откроется после ${c.need} освоенных (сейчас ${overall.mastered})`,
                  )
                }
              >
                {open ? c.emoji : "🔒"} {c.name}
                {isNext ? ` · ${overall.mastered}/${c.need}` : ""}
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Города открываются за освоенные вопросы. Финал — Warszawa, твой собес.
        </div>
      </div>

      <div className="panel">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <b>🏅 Ачивки</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {achGot}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="badge-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = !!game.ach[a.id];
            return (
              <button
                key={a.id}
                className={"badge" + (got ? " got" : "")}
                onClick={() => flashStore(`${got ? "🏅" : "🔒"} ${a.title}: ${a.desc}`)}
              >
                <span className="b-ico">{a.emoji}</span>
                <span>{a.title}</span>
              </button>
            );
          })}
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
