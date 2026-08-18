"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHintRate, formatScore } from "@/lib/admin/format";
import type { AdminClientRow, AdminManagerClientsPayload } from "@/lib/admin/clients";
import type { AdminManagerRow } from "@/lib/admin/stats";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminManagers({ managers }: { managers: AdminManagerRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<AdminManagerClientsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openManager(manager: AdminManagerRow) {
    setSelectedId(manager.id);
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/admin/managers/${manager.id}/clients`);
    const body = (await response.json().catch(() => ({}))) as AdminManagerClientsPayload & {
      error?: string;
    };
    setLoading(false);
    if (!response.ok) {
      setPanel(null);
      setError(body.error ?? "Не удалось загрузить клиентов");
      return;
    }
    setPanel(body);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
      <section className="space-y-3">
        <h2 className="font-heading text-lg">Менеджеры</h2>
        <p className="text-sm text-muted-foreground">Нажмите строку, чтобы открыть клиентов и ленты.</p>
        <div className="overflow-hidden rounded-xl border border-border bg-card/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Имя</TableHead>
                <TableHead>Ответы</TableHead>
                <TableHead>Оценка</TableHead>
                <TableHead>Подсказка</TableHead>
                <TableHead>Подборы</TableHead>
                <TableHead>Клиенты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.map((manager) => {
                const active = manager.id === selectedId;
                return (
                  <TableRow
                    key={manager.id}
                    className={`cursor-pointer ${active ? "bg-accent" : "hover:bg-muted/40"}`}
                    onClick={() => void openManager(manager)}
                  >
                    <TableCell className="font-heading">{manager.name}</TableCell>
                    <TableCell>{manager.replies}</TableCell>
                    <TableCell>{formatScore(manager.avgScore)}</TableCell>
                    <TableCell>{formatHintRate(manager.hintRate)}</TableCell>
                    <TableCell>{manager.suggestions}</TableCell>
                    <TableCell>{manager.clients}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <aside className="rounded-xl border border-border bg-card/80 p-4">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">Выберите менеджера в таблице.</p>
        ) : null}
        {loading ? <p className="text-sm text-muted-foreground">Загружаю клиентов…</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {panel && !loading ? <ClientList panel={panel} /> : null}
      </aside>
    </div>
  );
}

function ClientList({ panel }: { panel: AdminManagerClientsPayload }) {
  if (panel.clients.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="font-heading text-sm">Клиенты {panel.manager.name}</h3>
        <p className="text-sm text-muted-foreground">Писем ещё нет.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-heading text-sm">Клиенты {panel.manager.name}</h3>
      <ul className="flex flex-col gap-3">
        {panel.clients.map((client) => (
          <li key={client.id} className="space-y-1">
            <div className="text-sm">
              <div className="font-medium">{client.displayName}</div>
              <div className="text-xs text-muted-foreground">{client.email}</div>
            </div>
            <ThreadLinks managerCode={panel.manager.code} client={client} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadLinks({
  managerCode,
  client,
}: {
  managerCode: string;
  client: AdminClientRow;
}) {
  if (client.conversations.length === 0) {
    return <p className="text-xs text-muted-foreground">Лент нет.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {client.conversations.map((item) => (
        <li key={item.id}>
          <a
            href={`/inbox?manager=${encodeURIComponent(managerCode)}&conversation=${encodeURIComponent(item.id)}`}
            className="block rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
          >
            <span className="truncate">{item.subject}</span>
            <span className="ml-2 text-xs text-muted-foreground">{formatTime(item.lastMessageAt)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
