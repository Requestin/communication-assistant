"use client";

import type { CSSProperties, ReactNode } from "react";

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
import type { AdminCharts } from "@/lib/admin/stats";

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";
const AMBER = "var(--primary)";
const MUTED_BAR = "var(--chart-2)";

type ChartCardProps = {
  title: string;
  empty: boolean;
  children: ReactNode;
};

function ChartCard({ title, empty, children }: ChartCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card/80 p-4">
      <h3 className="mb-3 font-heading text-sm">{title}</h3>
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

export function AdminCharts({ charts }: { charts: AdminCharts }) {
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
  const dayData = charts.overallByDay.map((row) => ({
    date: row.date.slice(5),
    fullDate: row.date,
    score: row.avgScore,
  }));

  const scoresEmpty = charts.scoreByManager.every((row) => row.avgScore === null);
  const hintsEmpty = charts.hintsByManager.every((row) => row.hints === 0);
  const daysEmpty = charts.overallByDay.length === 0;

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

      <ChartCard title="Динамика оценки" empty={daysEmpty}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 5]} stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(value) => [`${value}`, "Оценка"]}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullDate ?? "")}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={AMBER}
              strokeWidth={2}
              dot={{ r: 3, fill: AMBER, strokeWidth: 0 }}
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
