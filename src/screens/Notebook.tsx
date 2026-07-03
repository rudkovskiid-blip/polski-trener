import { useMemo, useState } from "react";
import { useStore, useAllCards } from "../store/useStore";
import { CATEGORIES } from "../data/categories";
import { speakPl, ttsSupported } from "../lib/tts";
import AnswerBlock from "../components/AnswerBlock";
import type { Card, CategoryId } from "../types";

type StatusFilter = "all" | "unmarked" | "marked";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU");
}

export default function Notebook() {
  const notebook = useStore((s) => s.notebook);
  const toggleNotebook = useStore((s) => s.toggleNotebook);
  const addCustomCard = useStore((s) => s.addCustomCard);
  const removeCustomCard = useStore((s) => s.removeCustomCard);
  const flash = useStore((s) => s.flash);
  const allCards = useAllCards();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [fCat, setFCat] = useState<CategoryId>("ogolne");
  const [fQru, setFQru] = useState("");
  const [fQpl, setFQpl] = useState("");
  const [fApl, setFApl] = useState("");
  const [fAru, setFAru] = useState("");

  const marked = useMemo(
    () => allCards.filter((c) => notebook[c.id]).length,
    [allCards, notebook],
  );
  const pct = allCards.length ? Math.round((marked / allCards.length) * 100) : 0;

  const byStatus = (c: Card) =>
    status === "all" ||
    (status === "marked" ? !!notebook[c.id] : !notebook[c.id]);

  const groups = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const all = allCards.filter((c) => c.category === cat.id);
        return {
          cat,
          total: all.length,
          marked: all.filter((c) => notebook[c.id]).length,
          cards: all.filter(byStatus),
        };
      }).filter((g) => g.cards.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, notebook, status],
  );

  const saveCustom = async () => {
    if (!fQru.trim() || !fApl.trim()) {
      flash("Нужны минимум вопрос по-русски и ответ по-польски");
      return;
    }
    await addCustomCard({
      category: fCat,
      q_ru: fQru.trim(),
      q_pl: fQpl.trim() || undefined,
      a_pl: fApl.trim(),
      a_ru: fAru.trim() || "—",
    });
    setFQru(""); setFQpl(""); setFApl(""); setFAru("");
    setFormOpen(false);
    flash("Вопрос добавлен и отмечен в тетрадке ✓");
  };

  const onDelete = (id: string) => {
    if (confirm("Удалить этот вопрос насовсем?")) removeCustomCard(id);
  };

  return (
    <div className="screen">
      <h1 className="h-title">Тетрадка</h1>
      <p className="h-sub">
        Отмечай вопросы, которые уже переписал от руки. Галочка = вопрос в работе.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="num">
            {marked}
            <span style={{ fontSize: 16, color: "var(--muted)" }}>/{allCards.length}</span>
          </div>
          <div className="cap">в тетрадке</div>
        </div>
        <div className="stat">
          <div className="num">{pct}%</div>
          <div className="cap">банка покрыто</div>
        </div>
        <div className="stat">
          <div className="num">{allCards.length - marked}</div>
          <div className="cap">осталось</div>
        </div>
      </div>

      <div className="bar" style={{ marginBottom: 14 }}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="chips">
        {(
          [
            ["all", "Все"],
            ["unmarked", "☐ Не в тетрадке"],
            ["marked", "📓 В тетрадке"],
          ] as [StatusFilter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={"chip" + (status === id ? " on" : "")}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <button className="btn ghost" onClick={() => setFormOpen((v) => !v)}>
        {formOpen ? "✕ Скрыть форму" : "＋ Свой вопрос"}
      </button>

      {formOpen && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Новый вопрос</div>
          <div className="stack">
            <select
              className="nb-input"
              value={fCat}
              onChange={(e) => setFCat(e.target.value as CategoryId)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.title_ru}
                </option>
              ))}
            </select>
            <input
              className="nb-input"
              placeholder="Вопрос по-русски *"
              value={fQru}
              onChange={(e) => setFQru(e.target.value)}
            />
            <input
              className="nb-input"
              placeholder="Pytanie po polsku"
              value={fQpl}
              onChange={(e) => setFQpl(e.target.value)}
            />
            <textarea
              className="nb-input"
              placeholder="Odpowiedź po polsku (эталон) *"
              value={fApl}
              onChange={(e) => setFApl(e.target.value)}
            />
            <textarea
              className="nb-input"
              placeholder="Перевод ответа по-русски"
              value={fAru}
              onChange={(e) => setFAru(e.target.value)}
            />
            <button className="btn primary" onClick={saveCustom}>
              Сохранить — сразу в тетрадку
            </button>
          </div>
        </div>
      )}

      <div className="stack" style={{ marginTop: 14 }}>
        {groups.map(({ cat, total, marked: catMarked, cards }) => (
          <div key={cat.id} className="panel">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <b>
                {cat.emoji} {cat.title_ru}
              </b>
              <span className="muted" style={{ fontSize: 13 }}>
                {catMarked}/{total}
              </span>
            </div>
            {cards.map((c) => {
              const mark = notebook[c.id];
              const isCustom = c.id.startsWith("cust_");
              const open = !!expanded[c.id];
              return (
                <div key={c.id} className="nb-row">
                  <button
                    className={"nb-check" + (mark ? " on" : "")}
                    title={mark ? `В тетрадке с ${fmtDate(mark.date)}` : "Отметить: переписан в тетрадку"}
                    onClick={() => toggleNotebook(c.id)}
                  >
                    {mark ? "✓" : ""}
                  </button>
                  <div
                    className="nb-body"
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: !open }))}
                  >
                    <div className="nb-qru">
                      {c.q_ru}
                      {c.personal && <span className="nb-tag">шаблон</span>}
                      {isCustom && <span className="nb-tag">свой</span>}
                    </div>
                    {c.q_pl && <div className="nb-qpl">{c.q_pl}</div>}
                    {mark && (
                      <div className="nb-date">📓 с {fmtDate(mark.date)}</div>
                    )}
                    {open && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <AnswerBlock card={c} />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          {c.q_pl && ttsSupported() && (
                            <button className="speak-btn" onClick={() => speakPl(c.q_pl!)}>
                              🔊 Вопрос
                            </button>
                          )}
                          {isCustom && (
                            <button
                              className="speak-btn"
                              style={{ color: "var(--red)" }}
                              onClick={() => onDelete(c.id)}
                            >
                              🗑 Удалить
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="empty">Под этот фильтр ничего не попало.</div>
        )}
      </div>
    </div>
  );
}
