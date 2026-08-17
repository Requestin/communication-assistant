"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth";
import type { InboxConversationDto, InboxMessageDto, InboxSnapshotDto } from "@/lib/inbox";

type InboxViewProps = {
  pollSeconds: number;
  role: UserRole;
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

function mergeMessages(
  server: InboxMessageDto[],
  previous: InboxMessageDto[],
): InboxMessageDto[] {
  const optimistic = previous.filter((item) => item.id.startsWith("tmp-"));
  const leftover = optimistic.filter(
    (item) =>
      !server.some(
        (message) => message.direction === "outbound" && message.bodyText === item.bodyText,
      ),
  );
  return [...server, ...leftover];
}

export function InboxView({ pollSeconds, role, managerCode }: InboxViewProps) {
  const [conversations, setConversations] = useState<InboxConversationDto[]>([]);
  const [messages, setMessages] = useState<InboxMessageDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReply = role === "manager";

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
      setMessages((previous) => mergeMessages(body.messages, previous));
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

  async function onSend() {
    if (!selected || !canReply || sending) {
      return;
    }
    const bodyText = draft.trim();
    if (!bodyText) {
      setError("Введите текст ответа");
      return;
    }

    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: InboxMessageDto = {
      id: tempId,
      conversationId: selected.id,
      direction: "outbound",
      fromEmail: "",
      toEmail: selected.clientEmail,
      subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
      bodyText,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bodyText }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: InboxMessageDto;
      };
      if (!response.ok || !payload.message) {
        setMessages((current) => current.filter((item) => item.id !== tempId));
        setDraft(bodyText);
        setError(payload.error ?? "Не удалось отправить письмо");
        return;
      }
      setMessages((current) =>
        current.map((item) => (item.id === tempId ? payload.message! : item)),
      );
    } catch {
      setMessages((current) => current.filter((item) => item.id !== tempId));
      setDraft(bodyText);
      setError("Не удалось отправить письмо");
    } finally {
      setSending(false);
    }
  }

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
                      setDraft("");
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
                    className={`max-w-[42rem] rounded-xl border border-border px-4 py-3 ${
                      message.direction === "outbound"
                        ? "ml-auto bg-primary/10"
                        : "bg-card"
                    }`}
                  >
                    <div className="mb-2 text-xs text-muted-foreground">
                      {message.direction === "outbound" ? "Исходящее" : "Входящее"} ·{" "}
                      {message.subject} · {formatTime(message.sentAt)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.bodyText}</p>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
        {canReply ? (
          <div className="space-y-3 border-t border-border bg-card/30 p-4">
            <Textarea
              disabled={!selected || sending}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ответ клиенту"
              aria-label="Ответ клиенту"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!selected || sending || !draft.trim()}
                onClick={() => void onSend()}
              >
                Отправить
              </Button>
              <Button variant="outline" disabled title="подбор будет позже">
                Подобрать решение
              </Button>
              <span className="text-sm text-muted-foreground">
                {selected ? "ответ уйдёт на почту клиента" : "выберите клиента"}
              </span>
            </div>
          </div>
        ) : (
          <div className="border-t border-border bg-card/30 p-4 text-sm text-muted-foreground">
            Главный не отвечает клиентам.
          </div>
        )}
      </section>
    </div>
  );
}
