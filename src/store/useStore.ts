import { create } from "zustand";
import type {
  CardProgress,
  PersonalAnswer,
  ExamResult,
  Grade,
  CategoryId,
} from "../types";
import {
  getAllProgress,
  getAllPersonal,
  getAllExams,
  putProgress,
  putPersonal,
  putExam,
  resetAll as dbResetAll,
} from "../lib/db";
import { newProgress, applyGrade } from "../lib/scheduler";
import { CATEGORIES } from "../data/categories";

interface StoreState {
  loaded: boolean;
  progress: Record<string, CardProgress>;
  personal: Record<string, PersonalAnswer>;
  exams: ExamResult[];
  selectedCategories: Set<CategoryId>;

  init: () => Promise<void>;
  grade: (cardId: string, grade: Grade) => Promise<void>;
  savePersonal: (id: string, text: string) => Promise<void>;
  addExam: (result: ExamResult) => Promise<void>;
  toggleCategory: (id: CategoryId) => void;
  setAllCategories: (on: boolean) => void;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
}

const ALL_CAT_IDS = CATEGORIES.map((c) => c.id);

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  progress: {},
  personal: {},
  exams: [],
  selectedCategories: new Set<CategoryId>(ALL_CAT_IDS),

  init: async () => {
    await get().refresh();
    set({ loaded: true });
  },

  refresh: async () => {
    const [progressArr, personalArr, examsArr] = await Promise.all([
      getAllProgress(),
      getAllPersonal(),
      getAllExams(),
    ]);
    set({
      progress: Object.fromEntries(progressArr.map((p) => [p.id, p])),
      personal: Object.fromEntries(personalArr.map((p) => [p.id, p])),
      exams: examsArr.sort((a, b) => b.finishedAt - a.finishedAt),
    });
  },

  grade: async (cardId, grade) => {
    const prev = get().progress[cardId] ?? newProgress(cardId);
    const next = applyGrade(prev, grade);
    await putProgress(next);
    set((s) => ({ progress: { ...s.progress, [cardId]: next } }));
  },

  savePersonal: async (id, text) => {
    const entry: PersonalAnswer = { id, text, updatedAt: Date.now() };
    await putPersonal(entry);
    set((s) => ({ personal: { ...s.personal, [id]: entry } }));
  },

  addExam: async (result) => {
    await putExam(result);
    set((s) => ({ exams: [result, ...s.exams] }));
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
}));
