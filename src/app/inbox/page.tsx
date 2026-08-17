import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSessionFromCookies } from "@/lib/auth-server";

export default async function InboxPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader name={session.name} role={session.role} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_1fr]">
        <aside className="border-b border-border bg-card/40 p-5 md:border-r md:border-b-0">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Клиенты</h2>
          <p className="text-sm text-muted-foreground">Список пуст.</p>
        </aside>
        <section className="flex min-h-[28rem] flex-col">
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-2">
              <p className="font-heading text-lg">Лента пуста</p>
              <p className="text-muted-foreground">
                Писем ещё нет. Клиент должен написать на ваш Gmail.
              </p>
            </div>
          </div>
          <div className="space-y-3 border-t border-border bg-card/30 p-4">
            <Textarea
              disabled
              placeholder="Ответ клиенту"
              aria-label="Ответ клиенту"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled title="писем ещё нет">
                Отправить
              </Button>
              <Button variant="outline" disabled title="писем ещё нет">
                Подобрать решение
              </Button>
              <span className="text-sm text-muted-foreground">писем ещё нет</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
