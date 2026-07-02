import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Grade as FsrsGrade,
  type Card as FsrsCard,
} from "ts-fsrs";
import type { CardProgress, Grade } from "../types";

// Параметры FSRS: целевой retention 0.9 — стандарт «как в Anki».
const f = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

const gradeToRating: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

// Новая запись прогресса для незнакомой карточки.
export function newProgress(id: string, now = new Date()): CardProgress {
  const c = createEmptyCard(now);
  return fromFsrs(id, c, 0, 0);
}

function toFsrs(p: CardProgress): FsrsCard {
  return {
    due: new Date(p.due),
    stability: p.stability,
    difficulty: p.difficulty,
    elapsed_days: p.elapsed_days,
    scheduled_days: p.scheduled_days,
    reps: p.reps,
    lapses: p.lapses,
    state: p.state as State,
    last_review: p.last_review ? new Date(p.last_review) : undefined,
  };
}

function fromFsrs(
  id: string,
  c: FsrsCard,
  attempts: number,
  correct: number,
): CardProgress {
  return {
    id,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
    attempts,
    correct,
  };
}

// Применить оценку пользователя и получить обновлённый прогресс.
export function applyGrade(
  prev: CardProgress,
  grade: Grade,
  now = new Date(),
): CardProgress {
  const { card } = f.next(toFsrs(prev), now, gradeToRating[grade]);
  const attempts = prev.attempts + 1;
  const correct = prev.correct + (grade === "good" ? 1 : 0);
  return fromFsrs(prev.id, card, attempts, correct);
}

// Карточка готова к повторению?
export function isDue(p: CardProgress | undefined, now = Date.now()): boolean {
  if (!p) return true; // новые карточки всегда доступны
  return p.due <= now;
}

// Карточка считается «освоенной»: в состоянии Review и интервал ≥ 21 дня.
export function isMastered(p: CardProgress | undefined): boolean {
  if (!p) return false;
  return p.state === State.Review && p.scheduled_days >= 21;
}

export { State };
