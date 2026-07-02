import type { Bank, Card } from "../types";
import { CATEGORIES } from "./categories";
import { PERSONAL_CARDS } from "./personal";
import cardsJson from "./cards.json";

// Все фактологические карточки (из cards.json) + карточки личного блока.
const factCards = cardsJson as Card[];

export const BANK: Bank = {
  version: "1.0",
  categories: CATEGORIES,
  cards: [...factCards, ...PERSONAL_CARDS],
};

export const ALL_CARDS = BANK.cards;

export const CARD_BY_ID: Record<string, Card> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export function cardsByCategory(catId: string): Card[] {
  return ALL_CARDS.filter((c) => c.category === catId);
}
