interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  comparison?: string;
  negative?: boolean;
  warning?: boolean;
  onClick?: () => void;
}

export default function KpiCard({ title, value, subtitle, comparison, negative, warning, onClick }: KpiCardProps) {
  const color = negative ? "text-red-600" : warning ? "text-amber-600" : "text-slate-900";
  const base = "flex flex-col gap-1 p-4 rounded-lg bg-white border border-slate-200";
  const clickable = onClick ? " cursor-pointer hover:border-teal-400 hover:shadow-sm" : "";
  return (
    <div className={base + clickable} onClick={onClick}>
      <div className={`text-lg sm:text-2xl font-semibold tabular-nums break-words ${color}`}>{value}</div>
      <div className="text-sm text-slate-600">{title}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      {comparison && <div className="text-xs text-slate-400">{comparison}</div>}
    </div>
  );
}
