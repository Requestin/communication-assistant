"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth";
import { roleLabel } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  name: string;
  role: UserRole;
};

function HeaderNavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: current ? "default" : "outline" }),
        "pressable",
      )}
    >
      {children}
    </Link>
  );
}

export function AppHeader({ name, role }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

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
            className="font-heading text-xl tracking-tight"
          >
            AI Помощник
          </Link>
          {role === "chief" ? (
            <nav className="flex items-center gap-2">
              <HeaderNavLink href="/admin" current={pathname.startsWith("/admin")}>
                Консоль
              </HeaderNavLink>
              <HeaderNavLink href="/inbox" current={pathname.startsWith("/inbox")}>
                Почта
              </HeaderNavLink>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex w-fit shrink-0 items-baseline whitespace-nowrap rounded-lg border border-border bg-background/40 px-2.5 py-1.5">
            <span className="font-heading text-base tracking-tight">{name}</span>
            <span className="text-muted-foreground">&nbsp;· {roleLabel(role)}</span>
          </div>
          <Button variant="outline" className="pressable" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </header>
  );
}
