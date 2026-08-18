"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminCharts as AdminChartsPayload } from "@/lib/admin/stats";
import { bucketScoreTrend, type TrendScale } from "@/lib/admin/trend";

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";
const AMBER = "var(--primary)";
const MUTED_BAR = "var(--chart-2)";

const TREND_SCALES: Array<{ id: TrendScale; label: string }> = [
  { id: "reply", label: "Ответы" },
  { id: "hour", label: "Часы" },
  { id: "day", label: "Дни" },
];

type ChartCardProps = {
  title: string;
  empty: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

function ChartCard({ title, empty, actions, children }: ChartCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex flex-col gap-2">
        <h3 className="font-heading text-sm">{title}</h3>
        {actions}
      </div>
      <div className="relative h-52">
        {children}
        {empty ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Пока нет оценок
          </p>
        ) : null}
      </div>
    </section>
  );
}

function tooltipStyle(): CSSProperties {
  return {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    color: "var(--foreground)",
    fontSize: 12,
  };
}

function TrendScaleSwitch({
  value,
  onChange,
}: {
  value: TrendScale;
  onChange: (scale: TrendScale) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Масштаб графика"
      className="grid grid-cols-3 rounded-lg border border-border bg-background/60 p-0.5"
    >
      {TREND_SCALES.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={
              selected
                ? "rounded-md bg-primary px-2 py-1 text-center text-[11px] font-medium text-primary-foreground"
                : "rounded-md px-2 py-1 text-center text-[11px] text-muted-foreground hover:text-foreground"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdminCharts({ charts }: { charts: AdminChartsPayload }) {
  const [trendScale, setTrendScale] = useState<TrendScale>("reply");
  const scoreData = charts.scoreByManager.map((row) => ({
    code: row.code,
    name: row.name,
    score: row.avgScore ?? 0,
  }));
  const hintData = charts.hintsByManager.map((row) => ({
    code: row.code,
    name: row.name,
    hints: row.hints,
  }));
  const trendData = useMemo(
    () =>
      bucketScoreTrend(
        charts.overallSeries.map((row) => ({
          at: new Date(row.at),
          overall: row.overall,
        })),
        trendScale,
      ),
    [charts.overallSeries, trendScale],
  );

  const scoresEmpty = charts.scoreByManager.every((row) => row.avgScore === null);
  const hintsEmpty = charts.hintsByManager.every((row) => row.hints === 0);
  const trendEmpty = charts.overallSeries.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Средняя оценка" empty={scoresEmpty}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={scoreData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="code" stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 5]} stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
              contentStyle={tooltipStyle()}
              formatter={(value) => [`${value}`, "Оценка"]}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? "")}
              isAnimationActive={false}
            />
            <Bar dataKey="score" fill={AMBER} maxBarSize={36} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Динамика оценки"
        empty={trendEmpty}
        actions={<TrendScaleSwitch value={trendScale} onChange={setTrendScale} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="key"
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickFormatter={(value) =>
                trendData.find((point) => point.key === value)?.label ?? String(value)
              }
              axisLine={false}
              tickLine={false}
              minTickGap={22}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, 5]} stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(value) => [`${value}`, "Оценка"]}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.tooltip ?? "")}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={AMBER}
              strokeWidth={2}
              dot={{ r: trendScale === "reply" && trendData.length > 8 ? 2 : 3, fill: AMBER, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Число подсказок" empty={hintsEmpty}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hintData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="code" stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "color-mix(in oklch, var(--primary) 12%, transparent)" }}
              contentStyle={tooltipStyle()}
              formatter={(value) => [`${value}`, "Подсказки"]}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? "")}
              isAnimationActive={false}
            />
            <Bar dataKey="hints" fill={MUTED_BAR} maxBarSize={36} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
