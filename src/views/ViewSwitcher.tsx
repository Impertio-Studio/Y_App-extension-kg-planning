import { useKgPlanning } from "../store";

const VIEWS = [
  { key: "grid" as const, label: "Grid" },
  { key: "gantt" as const, label: "Gantt" },
  { key: "team" as const, label: "Team" },
];

export default function ViewSwitcher() {
  const { activeView, setActiveView } = useKgPlanning();
  return (
    <div className="inline-flex gap-1 bg-slate-100 p-0.5 rounded-md" role="tablist">
      {VIEWS.map((v) => {
        const active = activeView === v.key;
        return (
          <button
            key={v.key}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveView(v.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
              active
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
