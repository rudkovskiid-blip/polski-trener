// Доменные типы тренажёра.

export type CategoryId =
  | "ogolne"
  | "historia"
  | "geografia"
  | "tradycje"
  | "ludzie"
  | "wspolczesna"
  | "osobiste";

export interface Category {
  id: CategoryId;
  title_ru: string;
  title_pl: string;
  emoji: string;
}

export interface Card {
  id: string;
  category: CategoryId;
  q_ru: string;
  q_pl?: string;
  a_pl: string;
  a_ru: string;
  translit?: string;
  why?: string;
  /** Мнемоника: созвучие, образ или рифма на русском — «крючок», как запомнить ответ. */
  mnemonic?: string;
  difficulty?: 1 | 2 | 3;
  tags?: string[];
  source?: string;
  /** true — карточка личного блока: эталон это шаблон, который пользователь адаптирует под себя. */
  personal?: boolean;
}

export interface Bank {
  version: string;
  categories: Category[];
  cards: Card[];
}

// Оценка пользователя при self-grade.
export type Grade = "again" | "hard" | "good";

// Прогресс по одной карточке (хранится в IndexedDB).
export interface CardProgress {
  id: string;
  // Поля состояния FSRS.
  due: number; // timestamp (ms), когда карточка снова к повторению
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review?: number; // timestamp (ms)
  // Накопительная статистика для аналитики.
  attempts: number;
  correct: number;
  // Метка последнего изменения (ms) — для слияния при облачной синхронизации
  // по правилу «выигрывает более свежая запись».
  updatedAt: number;
}

// Личный ответ пользователя для карточек personal-блока.
export interface PersonalAnswer {
  id: string; // = card.id
  text: string;
  updatedAt: number;
}

// Результат сессии «Экзамен».
export interface ExamResult {
  id: string;
  startedAt: number;
  finishedAt: number;
  durationSec: number;
  total: number;
  correct: number;
  partial: number;
  wrong: number;
  weakCategories: CategoryId[];
}

// Отметка «вопрос переписан в тетрадку от руки».
export interface NotebookMark {
  id: string; // = card.id
  date: number; // timestamp (ms)
}

// Слово из личного словаря: тап по слову в ответе → «В словарь».
export interface SavedWord {
  id: string; // нормализованная форма: нижний регистр, без пунктуации по краям
  word: string; // как слово встретилось в тексте (с оригинальным регистром)
  translation: string; // перевод RU из словаря банка ("—", если перевода нет)
  context?: string; // предложение, из которого слово взято
  addedAt: number; // timestamp (ms)
  updatedAt: number; // метка последнего изменения — для облачного слияния
  progress: CardProgress; // FSRS-расписание повторения слова
}

// Игровое состояние: XP, босс, ачивки, дни занятий.
export interface GameState {
  xp: number;
  bossWins: number;
  bossLastWin: number | null; // timestamp (ms)
  ach: Record<string, number>; // id ачивки -> timestamp получения
  days: string[]; // YYYY-MM-DD — дни, когда занимался
}

// Полный снимок для экспорта/импорта.
export interface BackupSnapshot {
  app: "polski-trener";
  version: string;
  exportedAt: number;
  progress: CardProgress[];
  personal: PersonalAnswer[];
  exams: ExamResult[];
  // Новые разделы (опциональны для совместимости со старыми бэкапами).
  notebook?: NotebookMark[];
  custom?: Card[];
  game?: GameState;
  words?: SavedWord[];
}
