import type { Category } from "../types";

export const CATEGORIES: Category[] = [
  { id: "ogolne", title_ru: "Общие и символы", title_pl: "Pytania ogólne", emoji: "🦅" },
  { id: "historia", title_ru: "История", title_pl: "Historia", emoji: "📜" },
  { id: "geografia", title_ru: "География", title_pl: "Geografia", emoji: "🗺️" },
  { id: "tradycje", title_ru: "Традиции и культура", title_pl: "Tradycje", emoji: "🎄" },
  { id: "ludzie", title_ru: "Знаменитые поляки", title_pl: "Znani Polacy", emoji: "👤" },
  { id: "wspolczesna", title_ru: "Современная Польша", title_pl: "Współczesna Polska", emoji: "🇪🇺" },
  { id: "bytowe", title_ru: "Бытовые фразы", title_pl: "Zwroty codzienne", emoji: "🛒" },
  { id: "osobiste", title_ru: "Личный блок", title_pl: "Blok osobisty", emoji: "💬" },
];

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<Category["id"], Category>;
