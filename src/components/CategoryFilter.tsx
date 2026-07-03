import { useStore, useAllCards } from "../store/useStore";
import { CATEGORIES } from "../data/categories";

export default function CategoryFilter() {
  const selected = useStore((s) => s.selectedCategories);
  const toggle = useStore((s) => s.toggleCategory);
  const setAll = useStore((s) => s.setAllCategories);
  const allCards = useAllCards();

  const allOn = selected.size === CATEGORIES.length;

  return (
    <div className="chips">
      <button
        className={"chip" + (allOn ? " on" : "")}
        onClick={() => setAll(!allOn)}
      >
        {allOn ? "✓ " : ""}Все темы
      </button>
      {CATEGORIES.map((c) => {
        const count = allCards.filter((x) => x.category === c.id).length;
        const on = selected.has(c.id);
        return (
          <button
            key={c.id}
            className={"chip" + (on ? " on" : "")}
            onClick={() => toggle(c.id)}
          >
            {c.emoji} {c.title_ru} ({count})
          </button>
        );
      })}
    </div>
  );
}
