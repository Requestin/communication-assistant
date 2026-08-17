"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InboxConversationDto, InboxMessageDto, InboxSnapshotDto } from "@/lib/inbox";

type InboxViewProps = {
  pollSeconds: number;
  managerCode?: string;
};

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

export function InboxView({ pollSeconds, managerCode }: InboxViewProps) {
  const [conversations, setConversations] = useState<InboxConversationDto[]>([]);
  const [messages, setMessages] = useState<InboxMessageDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const params = new URLSearchParams();
    if (selectedId) {
      params.set("conversationId", selectedId);
    }
    if (managerCode) {
      params.set("manager", managerCode);
    }
    const query = params.toString();
    const response = await fetch(`/api/inbox/snapshot${query ? `?${query}` : ""}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось обновить ленту");
      return;
    }
    const body = (await response.json()) as InboxSnapshotDto;
    setError(null);
    setConversations(body.conversations);
    if (!selectedId && body.conversations[0]) {
      setSelectedId(body.conversations[0].id);
      return;
    }
    if (selectedId) {
      setMessages(body.messages);
    }
  }, [managerCode, selectedId]);

  useEffect(() => {
    void load();
    const intervalMs = Math.max(1, pollSeconds) * 1000;
    const timer = window.setInterval(() => {
      void load();
    }, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, pollSeconds]);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const emptyList = conversations.length === 0;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_1fr]">
      <aside className="border-b border-border bg-card/40 p-5 md:border-r md:border-b-0">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Клиенты</h2>
        {emptyList ? (
          <p className="text-sm text-muted-foreground">Список пуст.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((item) => {
              const active = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setMessages([]);
                    }}
                    className={`pressable w-full rounded-lg px-3 py-2 text-left ${
                      active ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-heading text-sm">{item.clientName}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.preview || item.subject}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatTime(item.lastMessageAt)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[28rem] flex-col">
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div className="max-w-md space-y-2">
                <p className="font-heading text-lg">{emptyList ? "Лента пуста" : "Выберите клиента"}</p>
                <p className="text-muted-foreground">
                  {emptyList
                    ? "Писем ещё нет. Клиент должен написать на ваш Gmail."
                    : "Слева список клиентов. Письма подтянутся сами."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              <div>
                <h1 className="font-heading text-xl">{selected.clientName}</h1>
                <p className="text-sm text-muted-foreground">{selected.clientEmail}</p>
              </div>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Писем в этой ленте пока нет.</p>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className="max-w-[42rem] rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="mb-2 text-xs text-muted-foreground">
                      {message.subject} · {formatTime(message.sentAt)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.bodyText}</p>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
        <div className="space-y-3 border-t border-border bg-card/30 p-4">
          <Textarea
            disabled
            placeholder="Ответ клиенту"
            aria-label="Ответ клиенту"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled title="отправка будет позже">
              Отправить
            </Button>
            <Button variant="outline" disabled title="отправка будет позже">
              Подобрать решение
            </Button>
            <span className="text-sm text-muted-foreground">
              {emptyList ? "писем ещё нет" : "отправка будет позже"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
