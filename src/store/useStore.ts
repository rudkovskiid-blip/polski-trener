import { useMemo } from "react";
import { create } from "zustand";
import type {
  Card,
  CardProgress,
  PersonalAnswer,
  ExamResult,
  Grade,
  CategoryId,
  NotebookMark,
  GameState,
} from "../types";
import {
  getAllProgress,
  getAllPersonal,
  getAllExams,
  getAllNotebook,
  getAllCustom,
  getGame,
  putProgress,
  putPersonal,
  putExam,
  putNotebook,
  deleteNotebook,
  putCustom,
  deleteCustom,
  putGame,
  resetAll as dbResetAll,
} from "../lib/db";
import { newProgress, applyGrade } from "../lib/scheduler";
import {
  DEFAULT_GAME,
  XP,
  ACH_BY_ID,
  computeUnlocks,
  todayKey,
} from "../lib/game";
import { CATEGORIES } from "../data/categories";
import { ALL_CARDS } from "../data/bank";

interface StoreState {
  loaded: boolean;
  progress: Record<string, CardProgress>;
  personal: Record<string, PersonalAnswer>;
  exams: ExamResult[];
  notebook: Record<string, NotebookMark>;
  custom: Card[];
  game: GameState;
  toast: string | null;
  selectedCategories: Set<CategoryId>;

  init: () => Promise<void>;
  grade: (cardId: string, grade: Grade) => Promise<void>;
  savePersonal: (id: string, text: string) => Promise<void>;
  addExam: (result: ExamResult) => Promise<void>;
  toggleNotebook: (cardId: string) => Promise<void>;
  addCustomCard: (input: {
    category: CategoryId;
    q_ru: string;
    q_pl?: string;
    a_pl: string;
    a_ru: string;
  }) => Promise<void>;
  removeCustomCard: (id: string) => Promise<void>;
  bossFinished: (win: boolean) => Promise<void>;
  flash: (msg: string) => void;
  toggleCategory: (id: CategoryId) => void;
  setAllCategories: (on: boolean) => void;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
}

const ALL_CAT_IDS = CATEGORIES.map((c) => c.id);

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<StoreState>((set, get) => {
  // Обновить игровое состояние: XP, день занятий, новые ачивки (+тост).
  const applyGame = async (
    mut: (g: GameState) => GameState,
    opts: { logDay?: boolean } = {},
  ) => {
    const s = get();
    let g = mut({ ...s.game, ach: { ...s.game.ach }, days: [...s.game.days] });
    if (opts.logDay) {
      const t = todayKey();
      if (!g.days.includes(t)) g.days = [...g.days, t];
    }
    const unlocked = computeUnlocks({
      game: g,
      notebook: s.notebook,
      custom: s.custom,
      progress: s.progress,
      cards: [...ALL_CARDS, ...s.custom],
      exams: s.exams,
    });
    if (unlocked.length) {
      const now = Date.now();
      const ach = { ...g.ach };
      unlocked.forEach((id) => (ach[id] = now));
      g = { ...g, ach };
      const a = ACH_BY_ID[unlocked[0]];
      if (a) get().flash(`🏅 Ачивка: ${a.emoji} ${a.title}`);
    }
    await putGame(g);
    set({ game: g });
  };

  return {
    loaded: false,
    progress: {},
    personal: {},
    exams: [],
    notebook: {},
    custom: [],
    game: { ...DEFAULT_GAME },
    toast: null,
    selectedCategories: new Set<CategoryId>(ALL_CAT_IDS),

    init: async () => {
      await get().refresh();
      set({ loaded: true });
    },

    refresh: async () => {
      const [progressArr, personalArr, examsArr, notebookArr, customArr, game] =
        await Promise.all([
          getAllProgress(),
          getAllPersonal(),
          getAllExams(),
          getAllNotebook(),
          getAllCustom(),
          getGame(),
        ]);
      set({
        progress: Object.fromEntries(progressArr.map((p) => [p.id, p])),
        personal: Object.fromEntries(personalArr.map((p) => [p.id, p])),
        exams: examsArr.sort((a, b) => b.finishedAt - a.finishedAt),
        notebook: Object.fromEntries(notebookArr.map((m) => [m.id, m])),
        custom: customArr.sort((a, b) => a.id.localeCompare(b.id)),
        game,
      });
    },

    grade: async (cardId, grade) => {
      const prev = get().progress[cardId] ?? newProgress(cardId);
      const next = applyGrade(prev, grade);
      await putProgress(next);
      set((s) => ({ progress: { ...s.progress, [cardId]: next } }));
      const gain =
        grade === "good" ? XP.gradeGood : grade === "hard" ? XP.gradeHard : XP.gradeAgain;
      await applyGame((g) => ({ ...g, xp: g.xp + gain }), { logDay: true });
    },

    savePersonal: async (id, text) => {
      const entry: PersonalAnswer = { id, text, updatedAt: Date.now() };
      await putPersonal(entry);
      set((s) => ({ personal: { ...s.personal, [id]: entry } }));
    },

    addExam: async (result) => {
      await putExam(result);
      set((s) => ({ exams: [result, ...s.exams] }));
      await applyGame((g) => g, { logDay: true });
    },

    toggleNotebook: async (cardId) => {
      const s = get();
      if (s.notebook[cardId]) {
        await deleteNotebook(cardId);
        set((st) => {
          const next = { ...st.notebook };
          delete next[cardId];
          return { notebook: next };
        });
      } else {
        const mark: NotebookMark = { id: cardId, date: Date.now() };
        await putNotebook(mark);
        set((st) => ({ notebook: { ...st.notebook, [cardId]: mark } }));
        await applyGame((g) => ({ ...g, xp: g.xp + XP.notebookMark }));
      }
    },

    addCustomCard: async (input) => {
      const card: Card = {
        id: `cust_${Date.now()}`,
        category: input.category,
        q_ru: input.q_ru,
        q_pl: input.q_pl || undefined,
        a_pl: input.a_pl,
        a_ru: input.a_ru,
        source: "свой вопрос",
      };
      await putCustom(card);
      set((s) => ({ custom: [...s.custom, card] }));
      // сразу в тетрадку — вопрос ведь уже переписан
      const mark: NotebookMark = { id: card.id, date: Date.now() };
      await putNotebook(mark);
      set((s) => ({ notebook: { ...s.notebook, [card.id]: mark } }));
      await applyGame((g) => ({ ...g, xp: g.xp + XP.customCard + XP.notebookMark }));
    },

    removeCustomCard: async (id) => {
      await deleteCustom(id);
      await deleteNotebook(id);
      set((s) => {
        const notebook = { ...s.notebook };
        delete notebook[id];
        return { custom: s.custom.filter((c) => c.id !== id), notebook };
      });
    },

    bossFinished: async (win) => {
      await applyGame(
        (g) =>
          win
            ? {
                ...g,
                xp: g.xp + XP.bossWin,
                bossWins: g.bossWins + 1,
                bossLastWin: Date.now(),
              }
            : g,
        { logDay: true },
      );
    },

    flash: (msg) => {
      set({ toast: msg });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 2600);
    },

    toggleCategory: (id) =>
      set((s) => {
        const next = new Set(s.selectedCategories);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedCategories: next };
      }),

    setAllCategories: (on) =>
      set({
        selectedCategories: new Set<CategoryId>(on ? ALL_CAT_IDS : []),
      }),

    reset: async () => {
      await dbResetAll();
      await get().refresh();
    },
  };
});

// Все карточки: банк + свои вопросы пользователя.
export function useAllCards(): Card[] {
  const custom = useStore((s) => s.custom);
  return useMemo(() => [...ALL_CARDS, ...custom], [custom]);
}
