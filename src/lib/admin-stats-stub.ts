import type { PrismaClient } from "@prisma/client";

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

export type AdminStatsPayload = {
  department: AdminDepartmentStats;
  managers: AdminManagerRow[];
};

const ZERO_METRICS: AdminDepartmentStats = {
  replies: 0,
  avgScore: null,
  hintRate: 0,
  suggestions: 0,
};

export async function buildZeroAdminStats(prisma: PrismaClient): Promise<AdminStatsPayload> {
  const managers = await prisma.user.findMany({
    where: { role: "manager" },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });

  return {
    department: { ...ZERO_METRICS },
    managers: managers.map((manager) => ({
      ...manager,
      ...ZERO_METRICS,
      clients: 0,
    })),
  };
}
