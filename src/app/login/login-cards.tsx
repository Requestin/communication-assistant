"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicUser } from "@/lib/auth";
import { homePathForRole, roleLabel } from "@/lib/auth-guard";

export function LoginCards({ users }: { users: PublicUser[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(userId: string) {
    setPendingId(userId);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = (await response.json()) as PublicUser & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Не удалось войти");
        return;
      }
      router.push(homePathForRole(body.role));
      router.refresh();
    } catch {
      setError("Не удалось войти");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            disabled={pendingId !== null}
            onClick={() => onLogin(user.id)}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{user.name}</CardTitle>
                <CardDescription>{roleLabel(user.role)}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {user.email ?? "без почты"}
                {pendingId === user.id ? (
                  <div className="mt-2 text-foreground">Входим…</div>
                ) : null}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
