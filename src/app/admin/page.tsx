import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildZeroAdminStats } from "@/lib/admin-stats-stub";
import { getSessionFromCookies } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

function formatScore(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default async function AdminPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "chief") {
    redirect("/inbox");
  }

  const stats = await buildZeroAdminStats(prisma);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader name={session.name} role={session.role} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
        <h1 className="text-2xl font-medium">Админка</h1>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Ответы отдела</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl">{stats.department.replies}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Средняя оценка</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl">
              {formatScore(stats.department.avgScore)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Доля с подсказкой</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl">{stats.department.hintRate}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Подборы</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl">{stats.department.suggestions}</CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Менеджеры</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Ответы</TableHead>
                <TableHead>Оценка</TableHead>
                <TableHead>Подсказка</TableHead>
                <TableHead>Подборы</TableHead>
                <TableHead>Клиенты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.managers.map((manager) => (
                <TableRow key={manager.id}>
                  <TableCell>{manager.name}</TableCell>
                  <TableCell>{manager.replies}</TableCell>
                  <TableCell>{formatScore(manager.avgScore)}</TableCell>
                  <TableCell>{manager.hintRate}</TableCell>
                  <TableCell>{manager.suggestions}</TableCell>
                  <TableCell>{manager.clients}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {["Средняя оценка", "Динамика оценки", "Число подсказок"].map((title) => (
            <div
              key={title}
              className="flex h-40 items-center justify-center rounded-xl bg-muted text-center text-sm text-muted-foreground"
            >
              {title}: появится после писем
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
