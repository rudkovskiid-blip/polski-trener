import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { speakPl, ttsSupported } from "../lib/tts";
import { isDue, isMastered, State } from "../lib/scheduler";
import { shuffle } from "../lib/queue";
import { normalizeWord } from "../lib/dict";
import type { Grade, SavedWord } from "../types";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU");
}

// --- Режимы заучивания ---
// Конкретный режим одного слова в очереди:
//  - recall_pl_ru: показываем польское слово → вспомни перевод (рецептивный recall);
//  - recall_ru_pl: показываем перевод → вспомни польское слово (продуктивный recall);
//  - mc_ru_pl: по русскому выбери польское слово (варианты — польские слова);
//  - mc_pl_ru: по польскому выбери перевод (варианты — русские переводы).
type WordMode = "recall_pl_ru" | "recall_ru_pl" | "mc_ru_pl" | "mc_pl_ru";
// Выбор пользователя в селекторе на экране словаря.
type SelectorMode = "mix" | "pl_ru" | "ru_pl" | "mc";

// Денормализованный элемент очереди: id слова + назначенный режим и
// (для multiple choice) зафиксированные варианты — чтобы они не пересчитывались
// на каждом ре-рендере.
interface QueueItem {
  id: string;
  mode: WordMode;
  options?: string[];
}

// --- Чистые хелперы (вне компонентов) ---

// Сравнение переводов без учёта регистра и хвостовых пробелов.
function eqTranslation(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Есть ли у слова осмысленный перевод — можно ли его показывать как
// RU-стимул или RU-дистрактор («—» и пустое не годятся).
function hasRu(w: SavedWord): boolean {
  return !!w.translation && w.translation.trim() !== "" && w.translation !== "—";
}

// Дистракторы строго из самого словаря: до 3 уникальных значений поля,
// не совпадающих с правильным ответом. Возвращает исходные строки (в родной форме).
function pickDistractors(
  current: SavedWord,
  allWords: SavedWord[],
  field: "word" | "translation",
): string[] {
  const keyOf = (val: string) =>
    field === "word" ? normalizeWord(val) : val.trim().toLowerCase();
  const correctKey = keyOf(field === "word" ? current.word : current.translation);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of shuffle(allWords)) {
    if (w.id === current.id) continue;
    const val = w[field];
    // Валидность значения по полю.
    if (field === "translation") {
      if (!val || val.trim() === "" || val === "—") continue;
    } else if (!val || val.trim() === "") {
      continue;
    }
    const key = keyOf(val);
    if (key === correctKey || seen.has(key)) continue; // не дублируем правильный/повтор
    seen.add(key);
    out.push(val);
    if (out.length >= 3) break;
  }
  return out;
}

// Собрать варианты для MC-элемента (правильный + 2..3 дистрактора, вперемешку).
// Возвращает null, если уникальных дистракторов < 2 — тогда MC невозможен.
function buildMcOptions(
  current: SavedWord,
  allWords: SavedWord[],
  field: "word" | "translation",
): string[] | null {
  const dist = pickDistractors(current, allWords, field);
  if (dist.length < 2) return null; // допускаем деградацию до 3 кнопок, но не меньше
  const correct = field === "word" ? current.word : current.translation;
  return shuffle([correct, ...dist]);
}

// Назначение режима слову в «Миксе» по «лестнице» FSRS-состояния:
//  - без перевода → только PL→RU recall;
//  - новое/learning → MC (низкий порог входа), чередуя направление; при недоборе
//    дистракторов — откат на recall_pl_ru;
//  - зрелое (mastered) → продуктивный recall_ru_pl (самое трудное);
//  - окрепшее (Review, не mastered) → recall_pl_ru.
// Зрелые слова НЕ идут в MC — защита от «дешёвого» роста стабильности.
function assignMixMode(w: SavedWord, allWords: SavedWord[], mcAlt: number): QueueItem {
  if (!hasRu(w)) return { id: w.id, mode: "recall_pl_ru" };

  const p = w.progress;
  const isNewLearning =
    p.reps === 0 || p.state === State.New || p.state === State.Learning;

  if (isNewLearning) {
    const mode: WordMode = mcAlt % 2 === 0 ? "mc_ru_pl" : "mc_pl_ru";
    const field = mode === "mc_ru_pl" ? "word" : "translation";
    const options = buildMcOptions(w, allWords, field);
    if (options) return { id: w.id, mode, options };
    return { id: w.id, mode: "recall_pl_ru" }; // мало дистракторов — откат
  }

  if (isMastered(p)) return { id: w.id, mode: "recall_ru_pl" };
  return { id: w.id, mode: "recall_pl_ru" };
}

// Построить очередь due-слов под выбранный режим селектора.
function buildQueue(
  words: Record<string, SavedWord>,
  selectorMode: SelectorMode,
): QueueItem[] {
  const all = Object.values(words);
  const due = shuffle(all.filter((w) => isDue(w.progress)));
  const items: QueueItem[] = [];
  let mcAlt = 0; // счётчик для чередования направлений MC

  for (const w of due) {
    if (selectorMode === "pl_ru") {
      items.push({ id: w.id, mode: "recall_pl_ru" });
      continue;
    }
    if (selectorMode === "ru_pl") {
      // Нет перевода — обратный перевод бессмыслен, откатываем на PL→RU.
      items.push({ id: w.id, mode: hasRu(w) ? "recall_ru_pl" : "recall_pl_ru" });
      continue;
    }
    if (selectorMode === "mc") {
      // Обе стороны MC требуют перевод (RU-стимул или правильный RU-вариант).
      if (!hasRu(w)) continue;
      const first: WordMode = mcAlt % 2 === 0 ? "mc_ru_pl" : "mc_pl_ru";
      const order: WordMode[] =
        first === "mc_ru_pl" ? ["mc_ru_pl", "mc_pl_ru"] : ["mc_pl_ru", "mc_ru_pl"];
      for (const m of order) {
        const field = m === "mc_ru_pl" ? "word" : "translation";
        const options = buildMcOptions(w, all, field);
        if (options) {
          items.push({ id: w.id, mode: m, options });
          mcAlt++;
          break;
        }
      }
      // Недобор дистракторов — слово пропускается в фиксированном режиме «Выбор».
      continue;
    }
    // mix
    const item = assignMixMode(w, all, mcAlt);
    if (item.mode === "mc_ru_pl" || item.mode === "mc_pl_ru") mcAlt++;
    items.push(item);
  }
  return items;
}

// Верен ли выбранный вариант для MC-элемента.
function isOptCorrect(item: QueueItem, cur: SavedWord, opt: string): boolean {
  if (item.mode === "mc_ru_pl") return normalizeWord(opt) === normalizeWord(cur.word);
  return eqTranslation(opt, cur.translation);
}

// Вкладка «Словарь»: слова, добавленные тапом из ответов,
// с повторением по тому же FSRS-расписанию, что и карточки.
export default function Words() {
  const words = useStore((s) => s.words);
  const removeWord = useStore((s) => s.removeWord);

  const [reviewing, setReviewing] = useState(false);
  // Режим не переживает перезагрузку (по спеке) — храним в локальном состоянии.
  const [selectorMode, setSelectorMode] = useState<SelectorMode>("mix");

  const list = useMemo(
    () => Object.values(words).sort((a, b) => b.addedAt - a.addedAt),
    [words],
  );
  const due = useMemo(() => list.filter((w) => isDue(w.progress)), [list]);
  const canMC = list.length >= 4; // multiple choice требует пул дистракторов

  const onDelete = (w: SavedWord) => {
    if (confirm(`Удалить «${w.word}» из словаря?`)) removeWord(w.id);
  };

  if (reviewing) {
    // Если «Выбор» стал недоступен (мало слов), откатываем на «Микс».
    const mode = selectorMode === "mc" && !canMC ? "mix" : selectorMode;
    return <WordSession mode={mode} onExit={() => setReviewing(false)} />;
  }

  const segBtn = (id: SelectorMode, label: string, disabled = false) => (
    <button
      className={`btn ghost${selectorMode === id ? " primary" : ""}`}
      disabled={disabled}
      title={disabled ? "Нужно ≥4 слова в словаре" : undefined}
      onClick={() => setSelectorMode(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="screen">
      <h1 className="h-title">Словарь</h1>
      <p className="h-sub">
        Тапни слово в любом польском ответе → «В словарь». Здесь эти слова
        повторяются по интервалам, как карточки.
      </p>

      {list.length > 0 && (
        <div className="seg">
          {segBtn("mix", "🎓 Микс")}
          {segBtn("pl_ru", "PL→RU")}
          {segBtn("ru_pl", "RU→PL")}
          {segBtn("mc", "Выбор", !canMC)}
        </div>
      )}

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

// Сессия повторения слов: мультирежим (recall в обе стороны + multiple choice).
function WordSession({ mode, onExit }: { mode: SelectorMode; onExit: () => void }) {
  const words = useStore((s) => s.words);
  const gradeWord = useStore((s) => s.gradeWord);

  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(words, mode));
  // Фиксируем исходную длину, чтобы прогресс-бар не «прыгал» назад при
  // возврате слов с оценкой «Не вспомнил» в конец очереди.
  const totalRef = useRef<number>(-1);
  if (totalRef.current < 0) totalRef.current = queue.length;
  const total = totalRef.current || 1;

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false); // раскрытие для recall
  const [hintShown, setHintShown] = useState(false); // подсказка (первая буква)
  const [selected, setSelected] = useState<string | null>(null); // выбранный вариант MC
  const [reviewed, setReviewed] = useState(0);
  const [correctCount, setCorrectCount] = useState(0); // верных ответов в MC
  const [wrongCount, setWrongCount] = useState(0); // неверных ответов в MC

  const item = queue[idx];
  const cur = item ? words[item.id] : undefined;
  const done = idx >= queue.length;

  // Слово удалено во время сессии — пропускаем его.
  useEffect(() => {
    if (item && !words[item.id]) setIdx((i) => i + 1);
  }, [item, words]);

  const advance = (appendAgain: boolean) => {
    if (appendAgain && item) setQueue((q) => [...q, item]);
    setIdx((i) => i + 1);
    setRevealed(false);
    setHintShown(false);
    setSelected(null);
  };

  // Самооценка в recall-режимах.
  const onGrade = (g: Grade) => {
    if (!cur) return;
    gradeWord(cur.id, g);
    setReviewed((r) => r + 1);
    // «Не вспомнил» — слово вернётся в конец текущей сессии.
    advance(g === "again");
  };

  // Раскрытие ответа в recall. Для RU→PL озвучиваем слово прямо в обработчике
  // клика (пользовательский жест — обходит iOS-политику автовоспроизведения).
  const onReveal = () => {
    setRevealed(true);
    if (item?.mode === "recall_ru_pl" && cur && ttsSupported()) {
      speakPl(cur.word, { rate: 0.75 });
    }
  };

  // Выбор варианта в MC (блокируем повторные тапы).
  const onSelect = (opt: string) => {
    if (selected !== null) return;
    setSelected(opt);
  };

  // «Дальше» после ответа в MC: авто-оценка good/again.
  const onMcNext = () => {
    if (!cur || !item || selected === null) return;
    const correct = isOptCorrect(item, cur, selected);
    gradeWord(cur.id, correct ? "good" : "again");
    setReviewed((r) => r + 1);
    if (correct) setCorrectCount((c) => c + 1);
    else setWrongCount((c) => c + 1);
    advance(!correct);
  };

  if (done || !cur || !item) {
    return (
      <div className="screen">
        <h1 className="h-title">Слова повторены 🎉</h1>
        <div className="card center stack">
          <div style={{ fontSize: 40 }}>📔</div>
          <div>
            Повторено слов: <b>{reviewed}</b>
          </div>
          {correctCount + wrongCount > 0 && (
            <div className="hint">
              В «Выборе»: верно <b>{correctCount}</b>, неверно <b>{wrongCount}</b>
            </div>
          )}
          <button className="btn ghost" onClick={onExit}>
            К словарю
          </button>
        </div>
      </div>
    );
  }

  const isMc = item.mode === "mc_ru_pl" || item.mode === "mc_pl_ru";
  const modeLabel = isMc
    ? "выбор"
    : item.mode === "recall_ru_pl"
      ? "RU→PL"
      : "PL→RU";
  // Стимул: для PL-режимов — польское слово, для RU — перевод.
  const stimulusPl = item.mode === "recall_pl_ru" || item.mode === "mc_pl_ru";
  const stimulus = stimulusPl ? cur.word : cur.translation;
  // Подсказка (первая буква) — цель зависит от направления recall.
  const hintTarget = item.mode === "recall_ru_pl" ? cur.word : cur.translation;
  const hintText =
    item.mode === "recall_ru_pl"
      ? "Вспомни слово по-польски и произнеси вслух."
      : "Вспомни перевод, потом проверь себя.";
  const revealLabel = item.mode === "recall_ru_pl" ? "Показать слово" : "Показать перевод";
  const pos = Math.min(idx + 1, total);

  // Полная карточка слова — раскрывается после ответа в MC.
  const fullCard = (
    <div className="answer">
      <div className="a-block">
        <div className="lbl">Слово</div>
        <div className="a-pl">
          {cur.word}{" "}
          {ttsSupported() && (
            <span
              className="speak-inline"
              onClick={() => speakPl(cur.word, { rate: 0.75 })}
            >
              🔊
            </span>
          )}
        </div>
      </div>
      <div className="a-block">
        <div className="lbl">Перевод</div>
        <div className="a-ru">{cur.translation}</div>
      </div>
      {cur.context && (
        <div className="a-block">
          <div className="lbl">Контекст</div>
          <div className="wd-ctx" style={{ marginTop: 2 }}>{cur.context}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="screen">
      <div className="exam-progress">
        <span style={{ width: `${Math.min((idx / total) * 100, 100)}%` }} />
      </div>
      <div className="learn-wrap">
        <div className="card">
          <span className="q-cat">
            📔 Словарь · {pos}/{total} · {modeLabel}
          </span>

          {/* Стимул */}
          <div className="q-ru" style={{ marginTop: 10 }}>
            {stimulus}{" "}
            {stimulusPl && ttsSupported() && (
              <span
                className="speak-inline"
                onClick={() => speakPl(cur.word, { rate: 0.75 })}
              >
                🔊
              </span>
            )}
          </div>

          {/* --- Recall (PL→RU / RU→PL): вспомни → раскрой → самооценка --- */}
          {!isMc && !revealed && (
            <>
              <p className="hint" style={{ marginTop: 14 }}>{hintText}</p>
              {hintShown ? (
                <p className="hint" style={{ marginTop: 6 }}>
                  Подсказка: <b>{hintTarget.trim().charAt(0) || "?"}…</b>
                </p>
              ) : (
                <button
                  className="btn ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => setHintShown(true)}
                >
                  Подсказка
                </button>
              )}
            </>
          )}
          {!isMc && revealed && (
            <div className="answer">
              {item.mode === "recall_ru_pl" ? (
                <div className="a-block">
                  <div className="lbl">Слово</div>
                  <div className="a-pl">
                    {cur.word}{" "}
                    {ttsSupported() && (
                      <span
                        className="speak-inline"
                        onClick={() => speakPl(cur.word, { rate: 0.75 })}
                      >
                        🔊
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="a-block">
                  <div className="lbl">Перевод</div>
                  <div className="a-ru">{cur.translation}</div>
                </div>
              )}
              {cur.context && (
                <div className="a-block">
                  <div className="lbl">Контекст</div>
                  <div className="wd-ctx" style={{ marginTop: 2 }}>{cur.context}</div>
                </div>
              )}
            </div>
          )}

          {/* --- Multiple choice: варианты → подсветка → полная карточка --- */}
          {isMc && (
            <>
              <div className="mc-list">
                {item.options!.map((opt, i) => {
                  let cls = "mc-opt";
                  if (selected !== null) {
                    if (isOptCorrect(item, cur, opt)) cls += " correct";
                    else if (opt === selected) cls += " wrong";
                  }
                  return (
                    <button
                      key={i}
                      className={cls}
                      disabled={selected !== null}
                      onClick={() => onSelect(opt)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {selected !== null && fullCard}
            </>
          )}
        </div>

        {/* --- Нижние действия --- */}
        {!isMc && !revealed && (
          <button className="btn primary" onClick={onReveal}>
            {revealLabel}
          </button>
        )}
        {!isMc && revealed && (
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
        {isMc && selected !== null && (
          <button className="btn primary" onClick={onMcNext}>
            Дальше
          </button>
        )}

        <button className="btn ghost" onClick={onExit}>
          Выйти
        </button>
      </div>
    </div>
  );
}
