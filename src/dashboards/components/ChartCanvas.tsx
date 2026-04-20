import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CSSProperties } from "react";

interface SeriesBase {
  key: string;
  label: string;
  color: string;
}

export type BarSeries = SeriesBase;
export type LineSeries = SeriesBase;

interface MonthlyChartProps<S extends SeriesBase> {
  labels: string[];
  series: S[];
  rows: Array<Record<string, number | string>>;
  height?: number;
  onBarClick?: (index: number, label: string) => void;
  style?: CSSProperties;
}

export function MonthlyBarChart({ labels, series, rows, height = 240, onBarClick }: MonthlyChartProps<BarSeries>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        onClick={(state) => {
          const idx = state?.activeTooltipIndex;
          if (!onBarClick || typeof idx !== "number") return;
          onBarClick(idx, labels[idx] ?? "");
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyLineChart({ series, rows, height = 240 }: MonthlyChartProps<LineSeries>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface CategoryBarProps {
  data: Array<{ label: string; value: number }>;
  color?: string;
  height?: number;
  onBarClick?: (index: number, label: string) => void;
}

export function CategoryBarChart({ data, color = "#14b8a6", height = 240, onBarClick }: CategoryBarProps) {
  const tickInterval = data.length > 10 ? "preserveStartEnd" : 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        onClick={(state) => {
          const idx = state?.activeTooltipIndex;
          if (!onBarClick || typeof idx !== "number") return;
          onBarClick(idx, data[idx]?.label ?? "");
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={tickInterval} angle={-30} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
