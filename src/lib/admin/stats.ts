import type { PrismaClient } from "@prisma/client";
import { bucketScoreTrend } from "./trend";

export type AdminDepartmentStats = {
  replies: number;
  avgScore: number | null;
  hintRate: number;
  suggestions: number;
};

export type AdminManagerRow = AdminDepartmentStats & {
  id: string;
  name: string;
  code: string;
  clients: number;
};

export type AdminCharts = {
  scoreByManager: Array<{ name: string; code: string; avgScore: number | null }>;
  overallSeries: Array<{ at: string; overall: number }>;
  overallByDay: Array<{ date: string; avgScore: number }>;
  hintsByManager: Array<{ name: string; code: string; hints: number }>;
};

export type AdminStatsPayload = {
  department: AdminDepartmentStats;
  managers: AdminManagerRow[];
  charts: AdminCharts;
};

export function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function averageOverall(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return roundScore(sum / values.length);
}

export function hintRate(hintCount: number, scoreCount: number): number {
  if (scoreCount <= 0) {
    return 0;
  }
  return hintCount / scoreCount;
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function increment(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

export async function buildAdminStats(prisma: PrismaClient): Promise<AdminStatsPayload> {
  const [
    managers,
    scoreGroups,
    hintGroups,
    outbound,
    offers,
    clientGroups,
    scoresForCharts,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: "manager" },
      orderBy: { code: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.qualityScore.groupBy({
      by: ["managerId"],
      _avg: { overall: true },
      _count: { _all: true },
    }),
    prisma.qualityScore.groupBy({
      by: ["managerId"],
      where: { showHint: true },
      _count: { _all: true },
    }),
    prisma.message.findMany({
      where: { direction: "outbound" },
      select: { conversation: { select: { managerId: true } } },
    }),
    prisma.aiNote.findMany({
      where: { type: "travel_offer" },
      select: { conversation: { select: { managerId: true } } },
    }),
    prisma.client.groupBy({
      by: ["managerId"],
      _count: { _all: true },
    }),
    prisma.qualityScore.findMany({
      select: { overall: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const repliesByManager = new Map<string, number>();
  for (const row of outbound) {
    increment(repliesByManager, row.conversation.managerId);
  }
  const suggestionsByManager = new Map<string, number>();
  for (const row of offers) {
    increment(suggestionsByManager, row.conversation.managerId);
  }
  const clientsByManager = new Map(
    clientGroups.map((row) => [row.managerId, row._count._all] as const),
  );
  const scoresByManager = new Map(
    scoreGroups.map((row) => [
      row.managerId,
      {
        avg: row._avg.overall == null ? null : roundScore(decimalToNumber(row._avg.overall)),
        count: row._count._all,
      },
    ]),
  );
  const hintsByManager = new Map(
    hintGroups.map((row) => [row.managerId, row._count._all] as const),
  );

  const managerRows: AdminManagerRow[] = managers.map((manager) => {
    const scores = scoresByManager.get(manager.id);
    const hints = hintsByManager.get(manager.id) ?? 0;
    return {
      id: manager.id,
      name: manager.name,
      code: manager.code,
      replies: repliesByManager.get(manager.id) ?? 0,
      avgScore: scores?.avg ?? null,
      hintRate: hintRate(hints, scores?.count ?? 0),
      suggestions: suggestionsByManager.get(manager.id) ?? 0,
      clients: clientsByManager.get(manager.id) ?? 0,
    };
  });

  const departmentScores = scoresForCharts.map((row) => decimalToNumber(row.overall));
  const departmentHints = [...hintsByManager.values()].reduce((sum, value) => sum + value, 0);
  const department: AdminDepartmentStats = {
    replies: outbound.length,
    avgScore: averageOverall(departmentScores),
    hintRate: hintRate(departmentHints, departmentScores.length),
    suggestions: offers.length,
  };

  const samples = scoresForCharts.map((row) => ({
    at: row.createdAt,
    overall: decimalToNumber(row.overall),
  }));
  const overallSeries = samples.map((sample) => ({
    at: sample.at.toISOString(),
    overall: sample.overall,
  }));
  const overallByDay = bucketScoreTrend(samples, "day").map((point) => ({
    date: point.key,
    avgScore: point.score,
  }));

  return {
    department,
    managers: managerRows,
    charts: {
      scoreByManager: managerRows.map((row) => ({
        name: row.name,
        code: row.code,
        avgScore: row.avgScore,
      })),
      overallSeries,
      overallByDay,
      hintsByManager: managerRows.map((row) => ({
        name: row.name,
        code: row.code,
        hints: hintsByManager.get(row.id) ?? 0,
      })),
    },
  };
}
