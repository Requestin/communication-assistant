import { LoginCards } from "./login-cards";
import { prisma } from "@/lib/db";
import { toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LOGIN_ORDER = ["M36", "M52", "M65", "CHIEF"];

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    select: { id: true, code: true, name: true, role: true, email: true },
  });

  const ordered = [...users].sort((left, right) => {
    const leftIndex = LOGIN_ORDER.indexOf(left.code);
    const rightIndex = LOGIN_ORDER.indexOf(right.code);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium">Вход</h1>
        <p className="text-muted-foreground">
          Выберите себя. Пароля нет — это учебный стенд.
        </p>
      </div>
      {ordered.length === 0 ? (
        <p>Нет пользователей, выполните `npm run db:seed`.</p>
      ) : (
        <LoginCards users={ordered.map(toPublicUser)} />
      )}
    </main>
  );
}
