"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth";
import type {
  InboxAlertDto,
  InboxConversationDto,
  InboxMessageDto,
  InboxNoteDto,
  InboxSnapshotDto,
  InboxSuggestJobDto,
} from "@/lib/inbox";
import { QualityNoteCard } from "./quality-note";
import { TravelOfferCard } from "./travel-offer";

type InboxViewProps = {
  pollSeconds: number;
  role: UserRole;
  managerCode?: string;
  managerName?: string;
  initialConversationId?: string;
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

type TimelineItem =
  | { kind: "message"; at: number; id: string; message: InboxMessageDto }
  | { kind: "note"; at: number; id: string; note: InboxNoteDto };

function buildTimeline(messages: InboxMessageDto[], notes: InboxNoteDto[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...messages.map((message) => ({
      kind: "message" as const,
      at: new Date(message.sentAt).getTime(),
      id: `message-${message.id}`,
      message,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      at: new Date(note.createdAt).getTime(),
      id: `note-${note.id}`,
      note,
    })),
  ];
  items.sort((a, b) => a.at - b.at);
  return items;
}

export function InboxView({
  pollSeconds,
  role,
  managerCode,
  managerName,
  initialConversationId,
}: InboxViewProps) {
  const [conversations, setConversations] = useState<InboxConversationDto[]>([]);
  const [messages, setMessages] = useState<InboxMessageDto[]>([]);
  const [notes, setNotes] = useState<InboxNoteDto[]>([]);
  const [jobs, setJobs] = useState<InboxSuggestJobDto[]>([]);
  const [alerts, setAlerts] = useState<InboxAlertDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReply = role === "manager";
  const travelBusy =
    suggesting || jobs.some((job) => job.status === "pending" || job.status === "processing");

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
    if (selectedId && !body.conversations.some((item) => item.id === selectedId)) {
      setSelectedId(body.conversations[0]?.id ?? null);
      return;
    }
    if (!selectedId && body.conversations[0]) {
      setSelectedId(body.conversations[0].id);
      return;
    }
    if (selectedId) {
      setMessages((previous) => mergeMessages(body.messages, previous));
      setNotes(body.notes);
      setJobs(body.jobs ?? []);
      setAlerts(body.alerts ?? []);
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
  const timeline = buildTimeline(messages, notes);
  const threadEmpty = timeline.length === 0 && !travelBusy;

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

  async function onSuggest() {
    if (!selected || suggesting) {
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${selected.id}/suggest`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
        status?: string;
      };
      if (!response.ok || !payload.jobId) {
        setError(payload.error ?? "Не удалось поставить подбор");
        setSuggesting(false);
        return;
      }
      await load();
    } catch {
      setError("Не удалось поставить подбор");
    } finally {
      setSuggesting(false);
    }
  }

  function insertOffer(text: string) {
    setDraft((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {managerName ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/70 px-6 py-2 text-sm">
          <p>
            Лента: <span className="font-heading">{managerName}</span>
          </p>
          <a href="/admin" className="text-primary hover:underline">
            Назад в админку
          </a>
        </div>
      ) : null}
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_1fr]">
      <aside className="border-b border-border bg-card/40 p-5 md:border-r md:border-b-0">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Диалоги</h2>
        {emptyList ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 px-3 py-4">
            <p className="font-heading text-sm">Клиентов пока нет</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Письмо на ваш Gmail появится здесь само, обычно за несколько секунд.
            </p>
          </div>
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
                      setNotes([]);
                      setJobs([]);
                      setAlerts([]);
                      setDraft("");
                      setSuggesting(false);
                    }}
                    className={`pressable w-full rounded-lg px-3 py-2 text-left ${
                      active ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-heading text-sm">{item.clientName}</div>
                    <div className="truncate text-xs text-foreground/80">{item.subject}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.preview}</div>
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
                <p className="font-heading text-lg">{emptyList ? "Ждём первое письмо" : "Выберите диалог"}</p>
                <p className="text-muted-foreground">
                  {emptyList
                    ? "Клиент пишет на ваш рабочий Gmail. Здесь не дыра и не ошибка — просто ещё нет переписки."
                    : "Слева диалоги по темам писем. Одна тема — одна лента."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              <div>
                <h1 className="font-heading text-xl">{selected.clientName}</h1>
                <p className="text-sm text-foreground/80">{selected.subject}</p>
                <p className="text-sm text-muted-foreground">{selected.clientEmail}</p>
              </div>
              {threadEmpty ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  В этой ленте пока нет писем.
                </p>
              ) : (
                timeline.map((item) =>
                  item.kind === "note" ? (
                    item.note.type === "travel_offer" ? (
                      <TravelOfferCard
                        key={item.id}
                        note={item.note}
                        canInsert={canReply}
                        onInsert={insertOffer}
                      />
                    ) : (
                      <QualityNoteCard key={item.id} note={item.note} />
                    )
                  ) : (
                    <article
                      key={item.id}
                      className={`max-w-[42rem] rounded-xl border border-border px-4 py-3 ${
                        item.message.direction === "outbound"
                          ? "ml-auto bg-primary/10"
                          : "bg-card"
                      }`}
                    >
                      <div className="mb-2 text-xs text-muted-foreground">
                        {item.message.direction === "outbound" ? "Исходящее" : "Входящее"} ·{" "}
                        {item.message.subject} · {formatTime(item.message.sentAt)}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{item.message.bodyText}</p>
                    </article>
                  ),
                )
              )}
              {alerts.map((alert) => (
                <div
                  key={alert.kind}
                  role="status"
                  className={`w-full rounded-xl border px-4 py-3 text-sm ${
                    alert.kind.endsWith("_failed")
                      ? "border-destructive/40 bg-destructive/10"
                      : "border-primary/45 bg-primary/12"
                  }`}
                >
                  {alert.kind === "quality_pending" ? <span className="busy-dot" aria-hidden /> : null}
                  {alert.message}
                </div>
              ))}
              {travelBusy ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="w-full rounded-xl border border-primary/45 bg-primary/12 px-4 py-3 text-sm"
                >
                  <span className="busy-dot" aria-hidden />
                  ИИ подбирает варианты…
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="space-y-3 border-t border-border bg-card/30 p-4">
          {canReply ? (
            <Textarea
              disabled={!selected || sending}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ответ клиенту"
              aria-label="Ответ клиенту"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Главный не отвечает клиентам.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canReply ? (
              <Button
                disabled={!selected || sending || !draft.trim()}
                onClick={() => void onSend()}
              >
                {sending ? (
                  <>
                    <span className="busy-dot" aria-hidden />
                    Отправляю…
                  </>
                ) : (
                  "Отправить"
                )}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={!selected || travelBusy}
              onClick={() => void onSuggest()}
            >
              {travelBusy ? (
                <>
                  <span className="busy-dot" aria-hidden />
                  ИИ думает…
                </>
              ) : (
                "Подобрать решение"
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selected
                ? canReply
                  ? "ответ уйдёт на почту клиента"
                  : "подбор только для сотрудников"
                : "выберите клиента"}
            </span>
          </div>
        </div>
      </section>
    </div>
    </div>
  );
}
