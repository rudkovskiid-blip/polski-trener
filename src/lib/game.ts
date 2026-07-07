// Игровые механики: XP и звания, путь по Польше, ачивки, босс «Консул».
import type {
  Card,
  CardProgress,
  ExamResult,
  GameState,
  NotebookMark,
} from "../types";
import { isMastered } from "./scheduler";

export const DEFAULT_GAME: GameState = {
  xp: 0,
  bossWins: 0,
  bossLastWin: null,
  ach: {},
  days: [],
};

/* ---------- XP и звания ---------- */

export interface Rank {
  xp: number;
  title: string;
  emoji: string;
}

export const RANKS: Rank[] = [
  { xp: 0, title: "Turysta", emoji: "🧳" },
  { xp: 150, title: "Student", emoji: "📚" },
  { xp: 400, title: "Warszawiak", emoji: "🚋" },
  { xp: 800, title: "Szlachcic", emoji: "🎩" },
  { xp: 1400, title: "Husarz", emoji: "🛡️" },
  { xp: 2200, title: "Prawie Polak", emoji: "🦅" },
  { xp: 3200, title: "Pan Polak", emoji: "👑" },
];

export function rankOf(xp: number): { cur: Rank; next: Rank | null; pct: number } {
  let cur = RANKS[0];
  let next: Rank | null = null;
  for (const r of RANKS) {
    if (xp >= r.xp) cur = r;
    else {
      next = r;
      break;
    }
  }
  const pct = next
    ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100)
    : 100;
  return { cur, next, pct };
}

// Начисления XP.
export const XP = {
  gradeGood: 10,
  gradeHard: 5,
  gradeAgain: 1,
  notebookMark: 5,
  customCard: 5,
  wordAdd: 2,
  bossWin: 100,
} as const;

/* ---------- Путь по Польше ---------- */

export interface City {
  need: number; // сколько освоенных карточек нужно
  name: string;
  emoji: string;
  fact: string;
}

export const CITIES: City[] = [
  { need: 1, name: "Gniezno", emoji: "🏰", fact: "Первая столица Польши. Здесь Лех увидел белого орла." },
  { need: 5, name: "Kraków", emoji: "🐉", fact: "Древняя столица: Вавель, дракон и первый университет." },
  { need: 12, name: "Toruń", emoji: "🌌", fact: "Город Коперника и пряников (pierniki)." },
  { need: 20, name: "Wrocław", emoji: "🧙", fact: "Город ста мостов и гномов (krasnale)." },
  { need: 30, name: "Poznań", emoji: "🐐", fact: "Козлики на ратуше; колыбель польского государства." },
  { need: 42, name: "Łódź", emoji: "🎬", fact: "Город кино и текстильных фабрик." },
  { need: 55, name: "Gdańsk", emoji: "⚓", fact: "Вестерплатте и родина «Солидарности»." },
  { need: 70, name: "Zakopane", emoji: "🏔️", fact: "Зимняя столица Польши, Татры." },
  { need: 85, name: "Lublin", emoji: "🤝", fact: "Здесь в 1569 подписали Люблинскую унию." },
  { need: 100, name: "Warszawa", emoji: "🏛️", fact: "Столица. Финал пути — твой собес. Powodzenia!" },
];

/* ---------- Босс «Консул» ---------- */

export const BOSS = {
  size: 15, // вопросов в бою
  secPerQuestion: 20, // таймер на вопрос
  failsAllowed: 3, // ошибок можно допустить
  cooldownDays: 7, // после победы Консул уходит на неделю
  minMarked: 5, // минимум вопросов в тетрадке для боя
} as const;

export function bossCooldownDays(game: GameState, now = Date.now()): number {
  if (!game.bossLastWin) return 0;
  const passed = Math.floor((now - game.bossLastWin) / 86400000);
  return Math.max(0, BOSS.cooldownDays - passed);
}

/* ---------- Дни и стрик ---------- */

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function streakDays(days: string[], now = new Date()): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date(now);
  for (;;) {
    if (set.has(todayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return n;
}

/* ---------- Ачивки ---------- */

export interface AchDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
}

export const ACHIEVEMENTS: AchDef[] = [
  { id: "first", emoji: "📓", title: "Первая запись", desc: "Отметить первый вопрос в тетрадке" },
  { id: "ten", emoji: "✍️", title: "Разогнался", desc: "10 вопросов в тетрадке" },
  { id: "fifty", emoji: "📚", title: "Полбанка", desc: "50 вопросов в тетрадке" },
  { id: "allmk", emoji: "🗂️", title: "Весь банк", desc: "Все вопросы в тетрадке" },
  { id: "custom", emoji: "🛠️", title: "Свой вопрос", desc: "Добавить свой вопрос" },
  { id: "sniper", emoji: "🎯", title: "Снайпер", desc: "Экзамен от 10 вопросов без единой ошибки" },
  { id: "boss", emoji: "⚔️", title: "Победа над Консулом", desc: "Выиграть босс-экзамен" },
  { id: "boss5", emoji: "🏆", title: "Гроза урядов", desc: "5 побед над Консулом" },
  { id: "streak7", emoji: "🔥", title: "Неделя подряд", desc: "Заниматься 7 дней подряд" },
  { id: "hist", emoji: "🏺", title: "Историк", desc: "Вся история освоена" },
  { id: "geo", emoji: "🗺️", title: "Географ", desc: "Вся география освоена" },
  { id: "trad", emoji: "🥟", title: "Свой человек", desc: "Все традиции освоены" },
];

export const ACH_BY_ID = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<string, AchDef>;

export function computeUnlocks(args: {
  game: GameState;
  notebook: Record<string, NotebookMark>;
  custom: Card[];
  progress: Record<string, CardProgress>;
  cards: Card[]; // весь банк, включая кастомные
  exams: ExamResult[];
}): string[] {
  const { game, notebook, custom, progress, cards, exams } = args;
  const got = new Set(Object.keys(game.ach));
  const out: string[] = [];
  const add = (id: string, cond: boolean) => {
    if (cond && !got.has(id)) out.push(id);
  };

  const marked = Object.keys(notebook).length;
  add("first", marked >= 1);
  add("ten", marked >= 10);
  add("fifty", marked >= 50);
  add("allmk", cards.length > 0 && marked >= cards.length);
  add("custom", custom.length > 0);
  add(
    "sniper",
    exams.some((e) => e.total >= 10 && e.wrong === 0 && e.partial === 0),
  );
  add("boss", game.bossWins >= 1);
  add("boss5", game.bossWins >= 5);
  add("streak7", streakDays(game.days) >= 7);

  const catDone = (cat: string) => {
    const catCards = cards.filter((c) => c.category === cat);
    return catCards.length > 0 && catCards.every((c) => isMastered(progress[c.id]));
  };
  add("hist", catDone("historia"));
  add("geo", catDone("geografia"));
  add("trad", catDone("tradycje"));

  return out;
}
