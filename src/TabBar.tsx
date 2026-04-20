import { useTranslation } from "react-i18next";

export type KgTab = "planning" | "financial" | "projects" | "hr";

interface TabBarProps {
  active: KgTab;
  onChange: (tab: KgTab) => void;
}

const TABS: { id: KgTab; labelKey: string }[] = [
  { id: "planning",   labelKey: "extensions.kg_planning.tab_planning" },
  { id: "financial",  labelKey: "extensions.kg_planning.dashboards.tab_financieel" },
  { id: "projects",   labelKey: "extensions.kg_planning.dashboards.tab_projecten" },
  { id: "hr",         labelKey: "extensions.kg_planning.dashboards.tab_hr" },
];

export default function TabBar({ active, onChange }: TabBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 bg-white overflow-x-auto">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer ${
              isActive
                ? "border-teal-600 text-teal-700 bg-slate-50"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
