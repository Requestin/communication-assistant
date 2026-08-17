"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { roleLabel } from "@/lib/auth-guard";

type AppHeaderProps = {
  name: string;
  role: UserRole;
};

export function AppHeader({ name, role }: AppHeaderProps) {
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Link
            href={role === "chief" ? "/admin" : "/inbox"}
            className="font-heading text-sm tracking-tight"
          >
            Помощник в коммуникации
          </Link>
          {role === "chief" ? (
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/admin" className="text-muted-foreground transition-colors hover:text-primary">
                Админка
              </Link>
              <Link href="/inbox" className="text-muted-foreground transition-colors hover:text-primary">
                Инбокс
              </Link>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <div className="font-medium">{name}</div>
            <div className="text-muted-foreground">{roleLabel(role)}</div>
          </div>
          <Button variant="outline" className="pressable" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </header>
  );
}
