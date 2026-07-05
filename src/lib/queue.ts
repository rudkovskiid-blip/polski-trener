import type { Card, CardProgress, CategoryId } from "../types";
import { isDue } from "./scheduler";

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Перемешать с чередованием категорий: round-robin по группам,
// чтобы подряд не шли карточки одной темы (interleaving).
function interleaveByCategory(cards: Card[]): Card[] {
  const groups = new Map<CategoryId, Card[]>();
  for (const c of cards) {
    if (!groups.has(c.category)) groups.set(c.category, []);
    groups.get(c.category)!.push(c);
  }
  const buckets = shuffle([...groups.values()].map((g) => shuffle(g)));
  const result: Card[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const b of buckets) {
      const next = b.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

// Очередь для режима «Учить»: новые + просроченные карточки выбранных тем,
// с чередованием категорий.
export function buildLearnQueue(
  cards: Card[],
  progress: Record<string, CardProgress>,
  selected: Set<CategoryId>,
  now = Date.now(),
): Card[] {
  const due = cards.filter(
    (c) => selected.has(c.category) && isDue(progress[c.id], now),
  );
  return interleaveByCategory(due);
}

// Очередь для повторения произвольного набора карточек (напр. отмеченных
// в тетрадке): все переданные карточки, независимо от расписания, вперемешку
// с чередованием тем.
export function buildReviewQueue(cards: Card[]): Card[] {
  return interleaveByCategory(cards);
}

// Сколько карточек к повторению сегодня (включая новые).
export function dueCount(
  cards: Card[],
  progress: Record<string, CardProgress>,
  selected: Set<CategoryId>,
  now = Date.now(),
): number {
  return cards.filter(
    (c) => selected.has(c.category) && isDue(progress[c.id], now),
  ).length;
}

// Выборка вопросов для экзамена: N случайных из выбранных тем, вперемешку.
export function sampleExam(
  cards: Card[],
  selected: Set<CategoryId>,
  n: number,
): Card[] {
  const pool = cards.filter((c) => selected.has(c.category));
  return shuffle(pool).slice(0, Math.min(n, pool.length));
}
