"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth";
import type {
  InboxAlertDto,
  InboxConversationDto,
  InboxManagerDto,
  InboxMessageDto,
  InboxNoteDto,
  InboxSuggestJobDto,
} from "@/lib/inbox";
import { fetchInboxSnapshot, inboxSnapshotQuery } from "@/lib/inbox-fetch";
import { nextInboxSelection } from "@/lib/inbox-selection";
import { isNearBottom, scrollToEnd } from "@/lib/inbox-scroll";
import { QualityNoteCard } from "./quality-note";
import { TravelOfferCard } from "./travel-offer";
import { DeleteConfirmDialog, ThreadDeleteButton } from "./delete-confirm";

type InboxViewProps = {
  pollSeconds: number;
  role: UserRole;
  managerCode?: string;
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

const REPLY_MIN_PX = 64;
const REPLY_MAX_PX = 224;

type PendingDelete =
  | { kind: "conversation"; id: string; title: string }
  | { kind: "message"; id: string }
  | { kind: "note"; id: string };

function fitReplyHeight(el: HTMLTextAreaElement) {
  el.style.height = "0px";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, REPLY_MIN_PX), REPLY_MAX_PX)}px`;
}

function deleteCopy(target: PendingDelete): { title: string; body: string } {
  if (target.kind === "conversation") {
    return {
      title: "Удалить диалог?",
      body: `«${target.title}» пропадёт из ленты, письма уйдут в Корзину Gmail.`,
    };
  }
  if (target.kind === "message") {
    return {
      title: "Удалить письмо?",
      body: "Исходящее пропадёт из ленты и уйдёт в Корзину Gmail.",
    };
  }
  return {
    title: "Удалить карточку?",
    body: "Подсказка пропадёт из ленты. В почту это не попадёт.",
  };
}

function inboxPagePath(managerCode?: string, conversationId?: string | null): string {
  const params = new URLSearchParams();
  if (managerCode) {
    params.set("manager", managerCode);
  }
  if (conversationId) {
    params.set("conversation", conversationId);
  }
  const query = params.toString();
  return query ? `/inbox?${query}` : "/inbox";
}

export function InboxView({
  pollSeconds,
  role,
  managerCode,
  initialConversationId,
}: InboxViewProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<InboxConversationDto[]>([]);
  const [managers, setManagers] = useState<InboxManagerDto[]>([]);
  const [messages, setMessages] = useState<InboxMessageDto[]>([]);
  const [notes, setNotes] = useState<InboxNoteDto[]>([]);
  const [jobs, setJobs] = useState<InboxSuggestJobDto[]>([]);
  const [alerts, setAlerts] = useState<InboxAlertDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [openConversation, setOpenConversation] = useState<InboxConversationDto | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canReply = role === "manager";
  const travelBusy =
    suggesting || jobs.some((job) => job.status === "pending" || job.status === "processing");
  const feedRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(true);
  const selectedIdRef = useRef(selectedId);

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const result = await fetchInboxSnapshot(
      fetch,
      inboxSnapshotQuery({ selectedId, managerCode }),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const body = result.snapshot;
    setError(null);
    setConversations(body.conversations);
    if (body.managers) {
      setManagers(body.managers);
    }
    const nextId = nextInboxSelection({
      selectedId,
      conversationIds: body.conversations.map((item) => item.id),
      autoSelectFirst: role === "manager",
      keepSelectedIfMissing: role === "chief",
    });
    if (nextId !== selectedId) {
      setSelectedId(nextId);
      if (!nextId) {
        setMessages([]);
        setNotes([]);
        setJobs([]);
        setAlerts([]);
        setOpenConversation(null);
      }
      return;
    }
    if (selectedId) {
      setOpenConversation((previous) => {
        if (body.openConversation?.id === selectedId) {
          return body.openConversation;
        }
        const fromList = body.conversations.find((item) => item.id === selectedId);
        return fromList ?? (previous?.id === selectedId ? previous : null);
      });
      setMessages((previous) => mergeMessages(body.messages, previous));
      setNotes(body.notes);
      setJobs(body.jobs ?? []);
      setAlerts(body.alerts ?? []);
    }
  }, [managerCode, role, selectedId]);

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

  const selected =
    conversations.find((item) => item.id === selectedId) ??
    (openConversation?.id === selectedId ? openConversation : null);
  const emptyList = conversations.length === 0;
  const timeline = buildTimeline(messages, notes);
  const threadEmpty = timeline.length === 0 && !travelBusy;

  useLayoutEffect(() => {
    if (selectedIdRef.current !== selectedId) {
      selectedIdRef.current = selectedId;
      forceScrollRef.current = true;
      stickToBottomRef.current = true;
    }
    const el = feedRef.current;
    if (!el) {
      return;
    }
    if (forceScrollRef.current || stickToBottomRef.current) {
      scrollToEnd(el);
      stickToBottomRef.current = true;
      forceScrollRef.current = false;
    }
  }, [selectedId, messages, notes, alerts, travelBusy]);

  useLayoutEffect(() => {
    const el = replyRef.current;
    if (!el) {
      return;
    }
    fitReplyHeight(el);
  }, [draft, selectedId, canReply]);

  function pinFeedToEnd() {
    forceScrollRef.current = true;
    stickToBottomRef.current = true;
  }

  function onFeedScroll() {
    const el = feedRef.current;
    if (!el) {
      return;
    }
    stickToBottomRef.current = isNearBottom(el);
  }

  function selectConversation(id: string) {
    pinFeedToEnd();
    setSelectedId(id);
    setMessages([]);
    setNotes([]);
    setJobs([]);
    setAlerts([]);
    setDraft("");
    setSuggesting(false);
    router.replace(inboxPagePath(managerCode, id));
  }

  function onManagerFilter(code: string) {
    router.replace(inboxPagePath(code || undefined, selectedId));
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) {
      return;
    }
    setDeleting(true);
    setError(null);
    const target = pendingDelete;
    const path =
      target.kind === "conversation"
        ? `/api/conversations/${target.id}`
        : target.kind === "message"
          ? `/api/conversations/${selectedId}/messages/${target.id}`
          : `/api/conversations/${selectedId}/notes/${target.id}`;
    try {
      const response = await fetch(path, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Не удалось удалить");
        return;
      }
      setPendingDelete(null);
      if (target.kind === "conversation") {
        setConversations((current) => current.filter((item) => item.id !== target.id));
        if (selectedId === target.id) {
          setSelectedId(null);
          setMessages([]);
          setNotes([]);
          setJobs([]);
          setAlerts([]);
          setOpenConversation(null);
          router.replace(inboxPagePath(managerCode));
        }
      } else if (target.kind === "message") {
        setMessages((current) => current.filter((item) => item.id !== target.id));
      } else {
        setNotes((current) => current.filter((item) => item.id !== target.id));
      }
      await load();
    } catch {
      setError("Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

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
    pinFeedToEnd();
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
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,12rem)_minmax(0,1fr)] md:grid-cols-[20rem_1fr] md:grid-rows-[minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-border bg-card/40 p-5 md:border-r md:border-b-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="shrink-0 font-heading text-base tracking-tight">Диалоги</h2>
            {role === "chief" ? (
              <select
                aria-label="Менеджер"
                value={managerCode ?? ""}
                onChange={(event) => onManagerFilter(event.target.value)}
                className="inbox-manager-select min-w-0 flex-1 rounded-lg border border-border bg-background py-1 pl-2.5 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Все</option>
                {managers.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
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
                  <li key={item.id} className="relative">
                    <button
                      type="button"
                      onClick={() => selectConversation(item.id)}
                      className={`pressable w-full rounded-lg px-3 py-2 text-left ${
                        canReply ? "pr-10" : ""
                      } ${active ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted/50"}`}
                    >
                      {role === "chief" && item.managerName ? (
                        <div className="truncate text-xs text-muted-foreground">{item.managerName}</div>
                      ) : null}
                      <div className="font-heading text-sm">{item.clientName}</div>
                      <div className="truncate text-xs text-foreground/80">{item.subject}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.preview}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatTime(item.lastMessageAt)}</div>
                    </button>
                    {canReply ? (
                      <span className="absolute top-1.5 right-1.5">
                        <ThreadDeleteButton
                          label="Удалить диалог"
                          onClick={() =>
                            setPendingDelete({
                              kind: "conversation",
                              id: item.id,
                              title: item.subject,
                            })
                          }
                        />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden">
          {selected ? (
            <div className="shrink-0 border-b border-border px-6 py-2">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h1 className="font-heading truncate text-base tracking-tight">
                      {selected.clientName}
                    </h1>
                    <p className="min-w-0 truncate text-sm text-muted-foreground">
                      {selected.clientEmail}
                    </p>
                  </div>
                  <p className="truncate text-sm text-foreground/80">{selected.subject}</p>
                </div>
                {role === "chief" && selected.managerName ? (
                  <p className="shrink-0 text-base text-muted-foreground">
                    Менеджер: {selected.managerName}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div
            ref={feedRef}
            onScroll={onFeedScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6"
          >
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-center">
                <div className="max-w-md space-y-2">
                  <p className="font-heading text-lg">{emptyList ? "Ждём первое письмо" : "Выберите диалог"}</p>
                  {emptyList ? (
                    <p className="text-muted-foreground">
                      Клиент пишет на ваш рабочий Gmail. Здесь не дыра и не ошибка — просто ещё нет переписки.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
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
                          canDelete={canReply}
                          onDelete={() => setPendingDelete({ kind: "note", id: item.note.id })}
                        />
                      ) : (
                        <QualityNoteCard
                          key={item.id}
                          note={item.note}
                          canDelete={canReply}
                          onDelete={() => setPendingDelete({ kind: "note", id: item.note.id })}
                        />
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
                        <div className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 flex-1">
                            {item.message.direction === "outbound" ? "Исходящее" : "Входящее"} ·{" "}
                            {item.message.subject} · {formatTime(item.message.sentAt)}
                          </span>
                          {canReply && item.message.direction === "outbound" ? (
                            <ThreadDeleteButton
                              label="Удалить письмо"
                              onClick={() =>
                                setPendingDelete({ kind: "message", id: item.message.id })
                              }
                            />
                          ) : null}
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
          {canReply ? (
            <div className="shrink-0 space-y-3 border-t border-border bg-card/30 p-4">
              <Textarea
                ref={replyRef}
                disabled={!selected || sending}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ответ клиенту"
                aria-label="Ответ клиенту"
                wrap="soft"
                className="field-sizing-fixed min-h-16 max-h-56 resize-none overflow-x-hidden overflow-y-auto px-3.5 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] [scrollbar-gutter:stable]"
              />
              <div className="flex flex-wrap items-center gap-2">
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
                {!selected ? (
                  <span className="text-sm text-muted-foreground">выберите клиента</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {pendingDelete ? (
        <DeleteConfirmDialog
          title={deleteCopy(pendingDelete).title}
          body={deleteCopy(pendingDelete).body}
          busy={deleting}
          onCancel={() => {
            if (!deleting) {
              setPendingDelete(null);
            }
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
