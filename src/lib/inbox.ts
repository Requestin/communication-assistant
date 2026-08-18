import type { AiNote, Job, Message, PrismaClient } from "@prisma/client";

export type InboxConversationDto = {
  id: string;
  clientName: string;
  clientEmail: string;
  subject: string;
  lastMessageAt: string;
  preview: string;
  managerCode?: string;
  managerName?: string;
};

export type InboxManagerDto = {
  code: string;
  name: string;
};

export type InboxMessageDto = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  createdAt: string;
};

export type InboxNoteDto = {
  id: string;
  conversationId: string;
  messageId: string | null;
  type: "quality_hint" | "travel_offer";
  title: string;
  body: string;
  createdAt: string;
  literacy: number | null;
  spelling: number | null;
  punctuation: number | null;
  businessStyle: number | null;
  overall: number | null;
  issues: string[];
  payload: Record<string, unknown>;
};

export type InboxSuggestJobDto = {
  id: string;
  type: "suggest_travel";
  status: "pending" | "processing";
};

export type InboxAlertDto = {
  kind: "quality_pending" | "quality_failed" | "suggest_failed";
  message: string;
};

export type InboxSnapshotDto = {
  conversations: InboxConversationDto[];
  messages: InboxMessageDto[];
  notes: InboxNoteDto[];
  jobs: InboxSuggestJobDto[];
  alerts: InboxAlertDto[];
  managers?: InboxManagerDto[];
  openConversation?: InboxConversationDto;
};

const PREVIEW_LEN = 160;

export function previewText(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= PREVIEW_LEN) {
    return oneLine;
  }
  return `${oneLine.slice(0, PREVIEW_LEN)}…`;
}

export function toMessageDto(message: Message): InboxMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    fromEmail: message.fromEmail,
    toEmail: message.toEmail,
    subject: message.subject,
    bodyText: message.bodyText,
    sentAt: message.sentAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
  };
}

function asScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function toNoteDto(note: AiNote): InboxNoteDto {
  const payload = asPayload(note.payload);
  return {
    id: note.id,
    conversationId: note.conversationId,
    messageId: note.messageId,
    type: note.type,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    literacy: asScore(payload.literacy),
    spelling: asScore(payload.spelling),
    punctuation: asScore(payload.punctuation),
    businessStyle: asScore(payload.businessStyle),
    overall: asScore(payload.overall),
    issues: asIssues(payload.issues),
    payload,
  };
}

export function toSuggestJobDto(job: Pick<Job, "id" | "type" | "status">): InboxSuggestJobDto | null {
  if (job.type !== "suggest_travel") {
    return null;
  }
  if (job.status !== "pending" && job.status !== "processing") {
    return null;
  }
  return { id: job.id, type: job.type, status: job.status };
}

export function staffAlertsFromJobs(
  jobs: Array<{ type: Job["type"]; status: Job["status"] }>,
): InboxAlertDto[] {
  const latestQuality = jobs.find((job) => job.type === "evaluate_quality");
  const latestSuggest = jobs.find((job) => job.type === "suggest_travel");
  const alerts: InboxAlertDto[] = [];
  if (latestQuality?.status === "pending" || latestQuality?.status === "processing") {
    alerts.push({ kind: "quality_pending", message: "ИИ оценивает ответ…" });
  } else if (latestQuality?.status === "failed") {
    alerts.push({ kind: "quality_failed", message: "Не удалось оценить ответ" });
  }
  if (latestSuggest?.status === "failed") {
    alerts.push({
      kind: "suggest_failed",
      message: "Не удалось подобрать варианты. ИИ недоступен.",
    });
  }
  return alerts;
}

type ConversationCard = {
  id: string;
  subject: string;
  lastMessageAt: Date;
  client: { displayName: string; email: string };
  manager: { code: string; name: string };
  messages: Array<{ bodyText: string }>;
};

function toConversationDto(item: ConversationCard): InboxConversationDto {
  return {
    id: item.id,
    clientName: item.client.displayName,
    clientEmail: item.client.email,
    subject: item.subject,
    lastMessageAt: item.lastMessageAt.toISOString(),
    preview: previewText(item.messages[0]?.bodyText ?? ""),
    managerCode: item.manager.code,
    managerName: item.manager.name,
  };
}

const conversationCardInclude = {
  client: { select: { displayName: true, email: true } },
  manager: { select: { code: true, name: true } },
  messages: { orderBy: { sentAt: "desc" as const }, take: 1 },
};

export async function buildInboxSnapshot(
  prisma: PrismaClient,
  options: {
    managerId?: string;
    accessManagerId?: string;
    conversationId?: string;
    since?: Date;
    includeManagers?: boolean;
  },
): Promise<InboxSnapshotDto> {
  const [conversations, managers] = await Promise.all([
    prisma.conversation.findMany({
      where: options.managerId ? { managerId: options.managerId } : undefined,
      orderBy: { lastMessageAt: "desc" },
      include: conversationCardInclude,
    }),
    options.includeManagers
      ? prisma.user.findMany({
          where: { role: "manager" },
          select: { code: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(undefined),
  ]);

  const conversationDtos = conversations.map(toConversationDto);
  const extras = managers ? { managers } : {};

  if (!options.conversationId) {
    return { conversations: conversationDtos, messages: [], notes: [], jobs: [], alerts: [], ...extras };
  }

  const thread = await prisma.conversation.findUnique({
    where: { id: options.conversationId },
    include: conversationCardInclude,
  });
  if (
    !thread ||
    (options.accessManagerId && thread.managerId !== options.accessManagerId)
  ) {
    return { conversations: conversationDtos, messages: [], notes: [], jobs: [], alerts: [], ...extras };
  }

  const [messages, notes, jobs, latestJobs] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId: options.conversationId,
        ...(options.since ? { createdAt: { gt: options.since } } : {}),
      },
      orderBy: { sentAt: "asc" },
    }),
    prisma.aiNote.findMany({
      where: {
        conversationId: options.conversationId,
        ...(options.since ? { createdAt: { gt: options.since } } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.job.findMany({
      where: {
        conversationId: options.conversationId,
        type: "suggest_travel",
        status: { in: ["pending", "processing"] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, status: true },
    }),
    prisma.job.findMany({
      where: { conversationId: options.conversationId },
      orderBy: { createdAt: "desc" },
      select: { type: true, status: true },
    }),
  ]);

  return {
    conversations: conversationDtos,
    messages: messages.map(toMessageDto),
    notes: notes.map(toNoteDto),
    jobs: jobs.flatMap((job) => {
      const dto = toSuggestJobDto(job);
      return dto ? [dto] : [];
    }),
    alerts: staffAlertsFromJobs(latestJobs),
    openConversation: toConversationDto(thread),
    ...extras,
  };
}
