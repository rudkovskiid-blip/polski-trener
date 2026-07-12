import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { speakPl, ttsSupported } from "../lib/tts";
import { isDue, State } from "../lib/scheduler";
import { shuffle, buildLearnQueue, dueCount } from "../lib/queue";
import { normalizeWord } from "../lib/dict";
import { EVERYDAY_CARDS } from "../data/everyday";
import StudySession from "../components/StudySession";
import type { CategoryId, Grade, SavedWord } from "../types";

// Категория бытовых фраз живёт только в этом блоке (в банк/фильтр не входит).
const PHRASE_CATS = new Set<CategoryId>(["bytowe"]);

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

// Денормализованный элемент очереди: id слова + назначенный режим и
// (для multiple choice) зафиксированные варианты — чтобы они не пересчитывались
// на каждом ре-рендере.
interface QueueItem {
  id: string;
  mode: WordMode;
  options?: string[];
  // false — разминочное упражнение: не влияет на FSRS-расписание.
  graded?: boolean;
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

// План упражнений для одного слова по «лестнице» FSRS-состояния. Как в Duolingo:
// одно слово может встретиться за сессию в нескольких видах упражнений по
// нарастанию сложности. Только зачётный recall влияет на FSRS — разминочный
// «выбор» идёт без оценки, чтобы не двигать интервал дважды за сессию.
//  - без перевода → PL→RU recall (единственный доступный вид);
//  - новое/learning → рецептивная разминка «выбор перевода» (без оценки) +
//    продуктивный RU→PL recall (вспомни и произнеси польское — самое ценное);
//  - окрепшее/зрелое → продуктивный RU→PL recall.
// Пассивную PL→RU-карточку (посмотрел польское → раскрыл перевод) убрали: она
// дублировала разминку и не имела forcing function. Зрелые слова НЕ идут в MC —
// защита от «дешёвого» роста стабильности.
function planWord(w: SavedWord, allWords: SavedWord[]): QueueItem[] {
  if (!hasRu(w)) return [{ id: w.id, mode: "recall_pl_ru" }];

  const p = w.progress;
  const isNewLearning =
    p.reps === 0 || p.state === State.New || p.state === State.Learning;

  if (isNewLearning) {
    const steps: QueueItem[] = [];
    // Разминка: узнавание перевода по польскому слову (рецептивно, без оценки) —
    // дополняет зачётный продуктивный recall, не дублируя его направление.
    const options = buildMcOptions(w, allWords, "translation");
    if (options) steps.push({ id: w.id, mode: "mc_pl_ru", options, graded: false });
    // Зачётное упражнение — продуктивный recall RU→PL.
    steps.push({ id: w.id, mode: "recall_ru_pl" });
    return steps;
  }

  // Окрепшие и зрелые: продуктивный recall RU→PL.
  return [{ id: w.id, mode: "recall_ru_pl" }];
}

// Собрать перемешанную очередь: для каждого due-слова — план упражнений, затем
// интерливинг «как в Duolingo» — на каждом шаге берём следующий шаг случайного
// ещё не исчерпанного слова. Порядок шагов внутри слова сохраняется (разминочный
// «выбор» всегда раньше зачётного recall), но типы упражнений и слова
// перемешиваются, а повторный показ слова разносится по сессии.
function buildQueue(words: Record<string, SavedWord>): QueueItem[] {
  const all = Object.values(words);
  const due = shuffle(all.filter((w) => isDue(w.progress)));
  const perWord = due.map((w) => planWord(w, all));

  const cursors = perWord.map(() => 0);
  const out: QueueItem[] = [];
  let remaining = perWord.reduce((n, s) => n + s.length, 0);
  while (remaining > 0) {
    // Индексы слов, у которых остались невыданные шаги.
    const eligible: number[] = [];
    for (let i = 0; i < perWord.length; i++) {
      if (cursors[i] < perWord[i].length) eligible.push(i);
    }
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    out.push(perWord[pick][cursors[pick]]);
    cursors[pick]++;
    remaining--;
  }
  return out;
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
  const progress = useStore((s) => s.progress);

  const [reviewing, setReviewing] = useState(false);
  const [phrasesSession, setPhrasesSession] = useState(false);

  const list = useMemo(
    () => Object.values(words).sort((a, b) => b.addedAt - a.addedAt),
    [words],
  );
  const due = useMemo(() => list.filter((w) => isDue(w.progress)), [list]);
  const phraseDue = useMemo(
    () => dueCount(EVERYDAY_CARDS, progress, PHRASE_CATS),
    [progress],
  );

  const onDelete = (w: SavedWord) => {
    if (confirm(`Удалить «${w.word}» из словаря?`)) removeWord(w.id);
  };

  if (reviewing) {
    return <WordSession onExit={() => setReviewing(false)} />;
  }
  if (phrasesSession) {
    return (
      <StudySession
        build={() => buildLearnQueue(EVERYDAY_CARDS, progress, PHRASE_CATS)}
        onExit={() => setPhrasesSession(false)}
        exitLabel="К словарю"
        heading="🛒 Бытовые фразы"
        doneTitle="Фразы повторены 🎉"
      />
    );
  }

  return (
    <div className="screen">
      <h1 className="h-title">Словарь</h1>
      <p className="h-sub">
        Тапни слово в любом польском ответе → «В словарь». Здесь эти слова
        повторяются по интервалам, а типы упражнений (перевод в обе стороны и
        выбор из вариантов) подмешиваются автоматически.
      </p>

      {/* Отдельный блок бытовых фраз — не смешан с экзаменом. */}
      <div className="card stack" style={{ marginBottom: 14 }}>
        <div className="row-between">
          <b>🛒 Бытовые фразы</b>
          <span className="wd-due">
            {phraseDue > 0 ? `${phraseDue} к повторению` : "всё повторено ✓"}
          </span>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {EVERYDAY_CARDS.length} частых фраз для магазина и улицы: тебя
          спрашивают — ты отвечаешь по-польски. Заучивай отдельным блоком.
        </p>
        <button
          className="btn primary"
          disabled={phraseDue === 0}
          onClick={() => setPhrasesSession(true)}
        >
          {phraseDue > 0 ? `🗣️ Учить фразы (${phraseDue})` : "Фразы повторены ✓"}
        </button>
      </div>

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
function WordSession({ onExit }: { onExit: () => void }) {
  const words = useStore((s) => s.words);
  const gradeWord = useStore((s) => s.gradeWord);

  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(words));
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

  // Выбор варианта в MC (блокируем повторные тапы). Как в Duolingo — при любом
  // тапе озвучиваем правильное польское слово (клик — пользовательский жест,
  // обходит iOS-политику автовоспроизведения).
  const onSelect = (opt: string) => {
    if (selected !== null) return;
    setSelected(opt);
    if (cur && ttsSupported()) speakPl(cur.word, { rate: 0.75 });
  };

  // «Дальше» после ответа в MC. Разминочный «выбор» (graded === false) не
  // трогает FSRS и не возвращает слово в очередь — оценивается только зачётный
  // recall того же слова дальше по сессии.
  const onMcNext = () => {
    if (!cur || !item || selected === null) return;
    const correct = isOptCorrect(item, cur, selected);
    const graded = item.graded !== false;
    if (graded) {
      gradeWord(cur.id, correct ? "good" : "again");
      setReviewed((r) => r + 1);
    }
    if (correct) setCorrectCount((c) => c + 1);
    else setWrongCount((c) => c + 1);
    advance(graded && !correct);
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
              Разминка (выбор): верно <b>{correctCount}</b>, неверно{" "}
              <b>{wrongCount}</b>
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
