export type Tab = "learn" | "notebook" | "exam" | "progress" | "guide";

const ITEMS: { id: Tab; ico: string; label: string }[] = [
  { id: "learn", ico: "🎓", label: "Учить" },
  { id: "notebook", ico: "📓", label: "Тетрадка" },
  { id: "exam", ico: "⏱️", label: "Экзамен" },
  { id: "progress", ico: "📊", label: "Прогресс" },
  { id: "guide", ico: "📖", label: "Гайд" },
];

export default function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={tab === it.id ? "active" : ""}
          onClick={() => onChange(it.id)}
        >
          <span className="ico">{it.ico}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
