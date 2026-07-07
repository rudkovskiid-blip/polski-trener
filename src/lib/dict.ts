import dictJson from "../data/dict.json";

// Мини-словарь PL→RU для всплывашки по тапу на слово.
// Собран из всех польских слов банка (q_pl/a_pl каждой карточки), поэтому
// покрывает всё, по чему можно тапнуть в эталонных ответах. Ключ — слово
// в той форме, в какой оно стоит в тексте (нижний регистр).
const DICT = dictJson as Record<string, string>;

// Нормализация слова: срезать пунктуацию по краям, привести к нижнему регистру.
// Тот же принцип, что и при пословной озвучке в TapWords.
const TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function normalizeWord(raw: string): string {
  return raw.replace(TRIM, "").toLowerCase();
}

export function lookupTranslation(raw: string): string | null {
  const w = normalizeWord(raw);
  if (!w) return null;
  return DICT[w] ?? null;
}
