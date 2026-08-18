import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHintRate, formatScore } from "@/lib/admin/format";
import { buildAdminStats } from "@/lib/admin/stats";
import { getSessionFromCookies } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { AdminCharts } from "./admin-charts";
import { AdminManagers } from "./admin-managers";

export default async function AdminPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "chief") {
    redirect("/inbox");
  }

  const stats = await buildAdminStats(prisma);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader name={session.name} role={session.role} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
        <h1 className="font-heading text-3xl tracking-tight">Консоль</h1>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Ответы отдела</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tracking-tight">
              {stats.department.replies}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Средняя оценка</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tracking-tight">
              {formatScore(stats.department.avgScore)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Доля с подсказкой</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tracking-tight">
              {formatHintRate(stats.department.hintRate)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Подборы</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tracking-tight">
              {stats.department.suggestions}
            </CardContent>
          </Card>
        </section>

        <AdminManagers managers={stats.managers} />
        <AdminCharts charts={stats.charts} />
      </main>
    </div>
  );
}
